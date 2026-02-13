
# Home Page – Daily Command Center
## Product Design Specification (Implementation-Ready)

---

## Purpose

The Home Page is the **primary execution surface** of the app.

It exists to answer three questions instantly:
1. What matters today?
2. What do I do next?
3. Is my life moving in the right direction?

This screen prioritizes **clarity and action** over exploration or reflection.

---

## Core Design Rules

- No planning on the home page
- No data entry beyond task completion
- No configuration or settings
- No explanations unless explicitly requested
- One screen, minimal scrolling

If the user has to think before acting, the design has failed.

---

## Screen Layout (Top → Bottom)

---

## 1. Orientation Header

### Elements
- Today’s date
- One short guiding principle (static text)

### Behavior
- Read-only
- Updates daily

### Purpose
Provides temporal and mental orientation without triggering decision-making.

---

## 2. Bottleneck Indicator (Highest Priority)

### Label
**Current Bottleneck**

### Content
- Active bottleneck domain (e.g., Work)
- Optional one-line descriptor (muted)
  - Example: “Conversion is limiting progress”

### Behavior
- Read-only
- Updated only when the system recalibrates
- No user override

### Purpose
Establishes authority and direction for the day.

---

## 3. Scoreboard

### Structure
Three compact domain cards:
- Personal
- Work
- Education

### Each card shows:
- Current streak count
- Status indicator:
  - Green: aligned
  - Yellow: neutral
  - Red: lagging

### Behavior
- Passive display
- No interaction

### Purpose
Quick situational awareness without gamification.

---

## 4. Today’s Tasks (Execution Layer)

### Structure
Tasks grouped by domain.

- Bottleneck domain is always shown first
- Maximum of 3 tasks per domain
- One task marked as **bottleneck action**

### Task Rules
- Concrete, executable language
- No editing or creation on this screen
- Completion is binary

### Interaction
- Tap to mark complete
- Immediate visual feedback

### Purpose
Drive execution without distraction.

---

## 5. Progress Snapshot (Trajectory)

### Elements
- Small embedded line graph
- Time range: last 30–90 days
- Single label:
  - “Trajectory: Improving / Flat / Declining”

### Behavior
- Read-only
- No drill-down from home page

### Purpose
Reinforces long-term direction without encouraging analysis.

---

## 6. Emotional Companion Entry Point

### Element
Subtle button or text link:
**Talk**

### Behavior
- Opens emotional companion chat
- Always available
- Never emphasized over execution

### Purpose
Allows emotional regulation without hijacking focus.

---

## 7. Primary Action

### Button
**Log Today**

### Behavior
- Opens the minimum viable input screen
- One tap, no confirmation

### Purpose
Close the daily execution loop.

---

## Navigation Model

Minimal and consistent:
- Home (default)
- Log / Input
- Talk
- Settings

Home always opens first.

---

## Explicit Exclusions

The following must never appear on the Home Page:
- Goal editing
- Metric input
- Historical lists
- Notifications
- Tooltips or explanations
- Customization controls

---

## Final Home Page Law

**If the Home Page causes reflection instead of action, it is broken.**
