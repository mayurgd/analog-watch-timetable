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
