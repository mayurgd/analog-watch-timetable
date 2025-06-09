import json
import boto3
import uuid
import decimal
from boto3.dynamodb.conditions import Key


# Helper class to handle decimal serialization
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super(DecimalEncoder, self).default(o)


def lambda_handler(event, context):
    # CORS Preflight check
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "*",
                "Access-Control-Allow-Methods": "OPTIONS,POST,GET",
            },
            "body": json.dumps({"message": "CORS preflight successful"}),
        }

    try:
        if event.get("body"):
            body = json.loads(event["body"])
        else:
            body = event
    except:
        body = event

    print("body:", body)

    dynamodb = boto3.resource("dynamodb")  # change region if needed
    task_table = dynamodb.Table("schedule_task_table")
    subtask_table = dynamodb.Table("schedule_subtask_table")

    action = body.get("action", "")

    try:
        if action == "get_schedule":
            return get_schedule(task_table, subtask_table)
        elif action == "update_task_completion":
            return update_task_completion(task_table, body)
        elif action == "update_subtask_completion":
            return update_subtask_completion(subtask_table, body)
        elif action == "update_task":
            return update_task(task_table, subtask_table, body)
        elif action == "add_transaction":
            transaction_table = dynamodb.Table("daily_transactions_table")
            return add_transaction(transaction_table, body)
        elif action == "get_transactions":
            transaction_table = dynamodb.Table("daily_transactions_table")
            return get_transactions(transaction_table, body)
        else:
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Invalid action"}),
            }
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)}),
        }


def get_schedule(task_table, subtask_table):
    # Get all tasks
    response = task_table.scan()
    tasks = response["Items"]

    # Sort tasks by order
    tasks.sort(key=lambda x: x["order"])

    # Get all subtasks
    subtask_response = subtask_table.scan()
    subtasks = subtask_response["Items"]

    # Group subtasks by task_id
    subtasks_by_task = {}
    for subtask in subtasks:
        task_id = subtask["task_id"]
        if task_id not in subtasks_by_task:
            subtasks_by_task[task_id] = []
        subtasks_by_task[task_id].append(subtask)

    # Sort subtasks by order within each task
    for task_id in subtasks_by_task:
        subtasks_by_task[task_id].sort(key=lambda x: x["order"])

    # Build the schedule structure
    schedule = []
    for task in tasks:
        task_id = task["task_id"]
        subtask_names = [st["subtask_name"] for st in subtasks_by_task.get(task_id, [])]

        schedule_item = {
            "task_id": task_id,
            "time": task["task_timing"],
            "name": task["task_name"],
            "subtasks": subtask_names,
            "column": task["residing_column"],
            "is_completed": task.get("is_completed", False),
            "subtask_details": subtasks_by_task.get(task_id, []),
        }
        schedule.append(schedule_item)

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"schedule": schedule}, cls=DecimalEncoder),
    }


def update_task_completion(task_table, body):
    task_id = body.get("task_id")
    is_completed = body.get("is_completed", False)

    if not task_id:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "task_id is required"}),
        }

    task_table.update_item(
        Key={"task_id": task_id},
        UpdateExpression="SET is_completed = :completed",
        ExpressionAttributeValues={":completed": is_completed},
    )

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"message": "Task completion updated successfully"}),
    }


def update_subtask_completion(subtask_table, body):
    subtask_id = body.get("subtask_id")
    is_completed = body.get("is_completed", False)

    if not subtask_id:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "subtask_id is required"}),
        }

    # Add is_completed field to subtask table
    subtask_table.update_item(
        Key={"subtask_id": subtask_id},
        UpdateExpression="SET is_completed = :completed",
        ExpressionAttributeValues={":completed": is_completed},
    )

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"message": "Subtask completion updated successfully"}),
    }


def update_task(task_table, subtask_table, body):
    task_id = body.get("task_id")
    task_name = body.get("task_name")
    task_timing = body.get("task_timing")
    residing_column = body.get("residing_column")
    new_subtasks = body.get("subtasks", [])

    if not task_id:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "task_id is required"}),
        }

    try:
        # Update the main task
        task_table.update_item(
            Key={"task_id": task_id},
            UpdateExpression="SET task_name = :name, task_timing = :timing, residing_column = :column, has_subtasks = :has_subtasks",
            ExpressionAttributeValues={
                ":name": task_name,
                ":timing": task_timing,
                ":column": residing_column,
                ":has_subtasks": len(new_subtasks) > 0,
            },
        )

        # Delete existing subtasks for this task
        existing_subtasks = subtask_table.scan(
            FilterExpression=Key("task_id").eq(task_id)
        )

        for subtask in existing_subtasks["Items"]:
            subtask_table.delete_item(Key={"subtask_id": subtask["subtask_id"]})

        # Add new subtasks
        for order, subtask_name in enumerate(new_subtasks):
            subtask_table.put_item(
                Item={
                    "subtask_id": str(uuid.uuid4()),
                    "task_id": task_id,
                    "order": order,
                    "subtask_name": subtask_name,
                    "is_completed": False,
                }
            )

        return {
            "statusCode": 200,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"message": "Task updated successfully"}),
        }

    except Exception as e:
        print(f"Error updating task: {str(e)}")
        return {
            "statusCode": 500,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": str(e)}),
        }


def add_transaction(transaction_table, body):
    transaction_text = body.get("transaction_text", "").strip()

    if not transaction_text:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps({"error": "transaction_text is required"}),
        }

    # Parse the transaction
    # Format: "reason - amount" or "reason + amount"
    if " - " in transaction_text:
        parts = transaction_text.split(" - ", 1)
        reason = parts[0].strip()
        amount_str = parts[1].strip()
        transaction_type = "debit"
        try:
            amount = float(amount_str)
        except ValueError:
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Invalid amount format"}),
            }
    elif " + " in transaction_text:
        parts = transaction_text.split(" + ", 1)
        reason = parts[0].strip()
        amount_str = parts[1].strip()
        transaction_type = "credit"
        try:
            amount = float(amount_str)
        except ValueError:
            return {
                "statusCode": 400,
                "headers": {"Access-Control-Allow-Origin": "*"},
                "body": json.dumps({"error": "Invalid amount format"}),
            }
    else:
        return {
            "statusCode": 400,
            "headers": {"Access-Control-Allow-Origin": "*"},
            "body": json.dumps(
                {"error": "Format should be 'reason - amount' or 'reason + amount'"}
            ),
        }

    # Get current date
    from datetime import datetime

    current_date = datetime.utcnow().strftime("%Y-%m-%d")

    # Add transaction to database
    transaction_table.put_item(
        Item={
            "transaction_id": str(uuid.uuid4()),
            "date": current_date,
            "transaction_type": transaction_type,
            "reason": reason,
            "amount": decimal.Decimal(str(amount)),
            "timestamp": datetime.utcnow().isoformat(),
        }
    )

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps({"message": "Transaction added successfully"}),
    }


def get_transactions(transaction_table, body):
    date_filter = body.get("date")  # Optional date filter

    if date_filter:
        # Get transactions for specific date
        response = transaction_table.scan(FilterExpression=Key("date").eq(date_filter))
    else:
        # Get all transactions
        response = transaction_table.scan()

    transactions = response["Items"]

    # Sort by timestamp (newest first)
    transactions.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

    # Calculate totals
    total_credit = sum(
        float(t["amount"]) for t in transactions if t["transaction_type"] == "credit"
    )
    total_debit = sum(
        float(t["amount"]) for t in transactions if t["transaction_type"] == "debit"
    )
    net_amount = total_credit - total_debit

    return {
        "statusCode": 200,
        "headers": {"Access-Control-Allow-Origin": "*"},
        "body": json.dumps(
            {
                "transactions": transactions,
                "summary": {
                    "total_credit": total_credit,
                    "total_debit": total_debit,
                    "net_amount": net_amount,
                },
            },
            cls=DecimalEncoder,
        ),
    }
