---
title: Kaur Khor User Decision Tree
markmap:
  colorFreezeLevel: 3
  duration: 250
  initialExpandLevel: 2
---

# Kaur Khor User Decision Tree

## User opens Kaur Khor

### What is the user trying to decide or do?

#### Primary intent: run today's inventory work

##### Decide next action

- What deserves attention now
- Workflow
  - Open command home
    - Recommended move first
  - Review supplier queue
    - To order
    - Awaiting receipt
    - Follow-up today
  - Review customer queue
    - Open demand
    - Stock blockers
    - Ready completions
  - Narrow queue
    - Search
    - Family
    - Issue type
    - Supplier
  - Open task drawer
    - Read why now
    - Read evidence
    - Use next button
  - Choose action
    - Start update
    - Open item
    - Inspect detail
    - Dismiss by completion
- Maps to simplified IA
  - Command Home
  - Inbox
  - Capture
  - Products
  - Insights

##### Capture reality

- Save stock, demand, supply, or correction evidence
- Workflow
  - Choose update lane
  - Products Update
    - Count physical stock
    - Reconcile facts
    - Save update
  - Customer Order
    - New customer ticket
    - Update existing customer ticket
    - Resume or discard draft
    - Save update
  - Immediate Sale
    - Same-session sale
    - Resolved immediately
    - Save update
  - Supplier Order
    - New supplier ticket
    - Update existing supplier ticket
    - Supplier Receipt branch
      - Existing supplier ticket only
      - Partial receipt
      - Full receipt
    - Save update
  - Custom capture
    - Combine multiple lanes
    - One real-world event
    - Resume or discard draft
- Writes
  - Ticket events
  - Observations
- Returns to
  - Inbox

##### Manage sellables

- Create, edit, archive, or open SKUs and services
- Workflow
  - Search or filter products
    - All
    - SKUs
    - Services
    - Supplier
  - Create SKU
    - Identity
    - Supplier
    - Price
    - Image
    - Planning fields
  - Create service
    - Identity
    - Dependency SKUs
    - Price
    - Image
  - Edit SKU definition
    - Names
    - Price
    - Supplier
    - Image
    - Planning controls
  - Edit service definition
    - Dependencies
    - Sellable details
  - Archive item
    - Remove from active work
    - Preserve history
  - Open detail
    - SKU command page
    - Service command page
- Maps to simplified IA
  - Products
  - Insights

##### Resolve commitments

- Customer and supplier ticket work
- Workflow
  - Choose commitment family
  - Customer ticket
    - Open
    - Blocked
    - Ready
    - Resolved
    - Canceled
    - Structured party metadata
      - Channel
      - Name
      - Phone
      - Lookup keys
    - Append revision
  - Supplier ticket
    - Ordered
    - ETA changed
    - Partial receipt
    - Full receipt
    - Append revision
  - Adjustment ticket
    - Shrinkage
    - Refund
    - Recount
    - Mistake
    - Append revision
  - Project downstream
    - Overview queue
    - Detail evidence
    - Performance
    - Financials
    - History
- Rules
  - Preserve ticket-backed source of truth
  - Do not overwrite operational history
  - Do not reintroduce loose order or receipt authoring
- Maps to simplified IA
  - Inbox
  - Capture
  - Insights
  - History

##### Handle customer intake

- Review automation requests and promote clean work
- Workflow
  - Check connection health
    - Connect
    - Pause
    - Open Telegram
    - Test message
  - Control exposure
    - Which SKUs customers can request
    - Which services customers can request
  - Review live intake
    - Active customer requests
  - Resolve ambiguous intake
    - Clarify
    - Dismiss
    - Keep waiting
  - Promote clean intake
    - Create customer-family ticket history
- Maps to simplified IA
  - Inbox
  - Products
  - Settings

#### Secondary intent: understand signals and refine decisions

##### Compare operating pressure

- Demand, support, timing, and price
- Workflow
  - Choose range
    - 7d
    - 30d
    - 90d
  - Choose scope
    - All
    - Services
    - SKUs
    - Supplier
  - Move now
    - Highest-priority action rows
  - Board
    - Demand
    - Support
    - Incoming stock
    - Price
  - Cash and blocked profit
    - Winners
    - Traps
    - Recovery pipeline
  - Price watch and drag
    - Margin conditions
    - Friction
    - Timing risk
- Maps to simplified IA
  - Insights

##### Inspect money view

- Sales, profit, capital, and leakage
- Workflow
  - Choose range
    - 1d
    - 7d
    - 30d
    - 90d
  - Choose scope
    - All
    - Services
    - SKUs
    - Supplier
  - Read statement blocks
    - Money in
    - Money tied up
    - Money leaking
  - Inspect contributors
    - Services driving the picture
    - SKUs driving the picture
  - Open follow-up
    - Row jumps to detail
    - Badge jumps to detail
- Guardrail
  - Financials is not an accounting ledger
  - Open customer tickets are not realized revenue
- Maps to simplified IA
  - Insights

##### Explain why

- Pressure, observations, fragility, and assumptions
- Workflow
  - Choose analysis scope
    - All
    - Services
    - SKUs
    - Supplier
  - Switch section
    - Workbench
    - Pressure
    - Observations
    - Fragility
    - Settings
  - Choose timeframe
    - Recent
    - 1M
    - 3M
    - YTD
    - 1Y
    - MAX
  - Inspect SKU or service detail
    - Availability
    - Demand
    - Evidence
    - Ledger
  - Adjust chart visibility
    - Indicators
    - Layout
    - Timeframe
  - Load older intervals
  - Expand chart when needed
- Maps to simplified IA
  - Insights

##### Audit history

- Saved reports, heatmap, edits, and deletion
- Workflow
  - Search saved reports
    - Notes
    - Names
    - Identifiers
  - Scope history
    - All
    - SKUs
    - Services
    - Supplier
  - Heatmap view
    - Recent-year contribution calendar
  - All reports list
    - Paginated saved updates
  - Edit report
    - Reopen matching update flow
  - Delete mistaken report
    - Confirmed permanent removal
- Maps to simplified IA
  - History

#### Other intent: maintain, configure, recover, or learn

##### Configure workspace

- Language, currency, UI density, and planning
- Workflow
  - Workspace preferences
    - Language
    - Currency
    - Image display
  - Interface preferences
    - Guidance
    - Right rail
    - Compare visibility
    - Page visibility
  - Planning parameters
    - Local analysis behavior
    - Rerun planning
- Maps to simplified IA
  - Settings

##### Protect local data

- Backup, restore, reveal path, and clear data
- Workflow
  - Create backup snapshot
    - Before risky work
  - Restore backup snapshot
    - Roll back local workspace
  - Reveal local data path
    - Inspect files in OS
  - Clear current data
    - Confirmed destructive reset
- Guardrail
  - Recovery and destructive actions stay separated
  - Backup comes before restore, clear, and delete
- Maps to simplified IA
  - Settings

##### Recover inactive records

- Archive search and unarchive
- Workflow
  - Search archive
    - All
    - SKUs
    - Services
    - Supplier
  - Unarchive item
    - Restore to active products
- Maps to simplified IA
  - Settings
  - Products

##### Learn or troubleshoot

- Search help and understand controls
- Workflow
  - Search help
    - Guide
    - Index
    - FAQ
    - Controls
  - Open Work queue
  - Start update
  - Open repository copy
- Maps to simplified IA
  - Settings
  - Command palette

##### Maintain app quality

- Benchmarks, exports, and diagnostics
- Workflow
  - Export logs
  - Export planning data
  - Open benchmark settings
  - Run or inspect benchmark-facing controls
- Maps to simplified IA
  - Settings

## Simplified app IA target

### Command Home

- Default first screen
- Shows recommended move first
- Provides the smallest set of launch points
  - Inbox
  - Capture
  - Products
  - Insights
  - Command palette

### Inbox

- Recommended move
- Supplier queue
- Customer queue
- Intake review
- Family filters instead of separate competing pages

### Capture

- Products update
- Customer order
- Immediate sale
- Supplier order
- Custom capture
- Draft resume and discard

### Products

- Active SKUs
- Active services
- Archive access
- Create and edit item definitions

### Insights

- Performance mode
- Financials mode
- Analysis mode
- Detail charts
- Explanation and comparison live together

### History

- Operations
- Reports
- Heatmap
- Edit report
- Delete report

### Settings

- Preferences
- Local data
- Planning
- Benchmarks
- Danger zone
- Help

### Command palette

- Universal jump
- Entity search
- Workflow launch
- Settings actions
- Expert layer instead of persistent navigation clutter

## UI rearrangement rules

### Make user verbs the top-level mental model

- Decide
- Capture
- Manage
- Understand
- Maintain

### Keep only daily work in persistent navigation

- Home
- Inbox
- Capture
- Products
- Insights

### Move infrequent surfaces behind contextual entry

- History
- Archive
- Benchmarks
- Danger zone

### Use command palette as the expert layer

- Pages
- Tabs
- Entities
- Workflows
- Settings actions

### Preserve ticket-backed source of truth

- No loose order authoring
- No loose receipt authoring
- Ticket events remain the operational record

### Let Overview become Inbox

- One queue
- Family filters
- Task filters
- Intake review

### Merge analysis surfaces conceptually

- Performance and Financials become Insights modes
- Analysis remains the explanation mode
- Detail charts belong under Insights and entity detail

### Separate destructive and recovery actions

- Backup before restore
- Backup before clear
- Confirmation before delete
- Danger zone remains isolated
