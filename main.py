import matplotlib.pyplot as plt
import numpy as np
import datetime
from matplotlib.animation import FuncAnimation
from matplotlib.patches import Wedge

# Set up the figure and axis
fig, ax = plt.subplots(figsize=(8, 8))
ax.set_xlim(-1.5, 1.5)
ax.set_ylim(-1.5, 1.5)
ax.set_aspect("equal")
ax.axis("off")

# Draw the outer circle for the clock face
outer_circle = plt.Circle((0, 0), 1.03, color="black", fill=False)
ax.add_artist(outer_circle)

# Add hour markers for a 24-hour clock
for hour in range(24):
    angle = (hour / 24) * 360
    x = np.cos(np.deg2rad(90 - angle))
    y = np.sin(np.deg2rad(90 - angle))
    ax.text(
        1.13 * x,
        1.13 * y,
        f"{hour}",
        horizontalalignment="center",
        verticalalignment="center",
        fontsize=12,
        weight="bold",
    )
    if hour in [0, 6, 12, 18]:
        ax.plot([1.04 * x, x], [1.04 * y, y], color="black", linewidth=3)
    else:
        ax.plot([1.04 * x, x], [1.04 * y, y], color="black")

circle2 = plt.Circle((0, 0), 1, color="black", fill=False, linewidth=2)
ax.add_artist(circle2)

# Timetable data
# Define the activities, their start and end times, and their colors
activities = [
    "Sleep",
    "Morning Routine",
    "Morning Leisure",
    "Work",
    "Lunch Break",
    "Afternoon Work",
    "Evening Leisure",
]
time_ranges = [(0, 8), (8, 9), (9, 10), (10, 13), (13, 14), (14, 19), (19, 24)]
colors = ["#d0e1f9", "#f4c2c2", "#c2f0c2", "#f9f1c0", "#d1c4e9", "#ffcc80", "#c2f0c2"]

# Draw wedges for each activity based on start and end hours
for (start_hour, end_hour), color, label in zip(time_ranges, colors, activities):
    # Convert start and end hours to angles
    theta1 = 90 - (start_hour / 24) * 360
    theta2 = 90 - (end_hour / 24) * 360

    # Draw the wedge for the activity
    wedge = Wedge(
        center=(0, 0),
        r=0.9,
        theta1=theta2,
        theta2=theta1,  # Reversed to make wedges clockwise
        color=color,
        edgecolor="black",
    )
    ax.add_patch(wedge)

    # Position the label in the middle of the wedge
    mid_angle = (theta1 + theta2) / 2
    x = 0.6 * np.cos(np.deg2rad(mid_angle))
    y = 0.6 * np.sin(np.deg2rad(mid_angle))

    # Determine text rotation for readability
    rotation_angle = (mid_angle - 180) % 360
    if start_hour >= 0 and start_hour < 12:  # Flip text for hours 0-12
        rotation_angle += 180

    fontsize = 10 if end_hour - start_hour >= 2 else 7
    ax.text(
        x,
        y,
        label,
        ha="center",
        va="center",
        fontsize=fontsize,
        weight="bold",
        color="black",
        rotation=rotation_angle,
    )

    # Draw a separator line at the start of the activity
    x_start = 0.2 * np.cos(np.deg2rad(theta1))
    y_start = 0.2 * np.sin(np.deg2rad(theta1))
    x_end = 0.9 * np.cos(np.deg2rad(theta1))
    y_end = 0.9 * np.sin(np.deg2rad(theta1))
    ax.plot([x_start, x_end], [y_start, y_end], color="black", lw=1)

# Title and subtitle
plt.title(
    "MAYUR's DAILY SCHEDULE",
    fontsize=16,
    fontweight="bold",
    fontfamily="serif",
    style="italic",
)
plt.text(
    0,
    1.40,
    "TODAY'S TIME TABLE",
    ha="center",
    va="center",
    fontsize=10,
    bbox=dict(facecolor="white", edgecolor="none", pad=2),
)

# Create the clock hands
(second_hand,) = ax.plot([], [], "r-", lw=1.5)  # Red color for second hand
(minute_hand,) = ax.plot([], [], "k-", lw=2)  # Black color for minute hand
(hour_hand,) = ax.plot([], [], "k-", lw=3)  # Black color for hour hand


# Function to update the clock hands
def update(frame):
    now = datetime.datetime.now()

    # Calculate the angles for the hands
    second_angle = np.deg2rad(90 - now.second * 6)
    minute_angle = np.deg2rad(90 - now.minute * 6 - now.second * 0.1)
    hour_angle = np.deg2rad(90 - (now.hour % 24) * 15 - now.minute * 0.25)

    # Set the hand positions
    second_hand.set_data([0, np.cos(second_angle)], [0, np.sin(second_angle)])
    minute_hand.set_data(
        [0, 0.75 * np.cos(minute_angle)], [0, 0.75 * np.sin(minute_angle)]
    )
    hour_hand.set_data([0, 0.5 * np.cos(hour_angle)], [0, 0.5 * np.sin(hour_angle)])

    return second_hand, minute_hand, hour_hand


# Animate the clock hands
ani = FuncAnimation(fig, update, frames=np.arange(0, 60), interval=1000, blit=True)

# Draw the center circle for clock start
center_circle = plt.Circle((0, 0), 0.1, color="red", fill=True)
center_circle_outer = plt.Circle((0, 0), 0.1, color="black", fill=False)
ax.add_artist(center_circle)
ax.add_artist(center_circle_outer)
ax.text(
    0, 0, "PLAY", ha="center", va="center", fontsize=9, weight="bold", color="white"
)

# Display the animated clock
plt.show()
