# Customer Search and Context

## Search Customers

Use `search_3chat_customers` before retrieving context or sending messages.

- Use only standard and custom fields in the live schema; never invent a field.
- Different populated fields use AND semantics.
- Values inside `name.filter` use OR semantics and support 1 to 100 unique names; `name.value` and `name.filter` are mutually exclusive.
- `conditionType=FILTER` means exact matching and `FUZZY` means fuzzy matching; omission inherits `match_mode`.
- `query_mode=resolve` locates one customer. Ask for selection on multiple matches only when the next action requires one customer.
- `query_mode=list` returns all matching customers with pagination and does not require one-customer confirmation.
- Continue pagination until the response establishes that the requested list is complete.

## Latest Inquiry Time

`last_visit_start_time` and `last_visit_end_time` filter the customer field `last_visit_time`.

- `last_visit_time` is the time when the customer most recently sent a message, meaning the latest inquiry time.
- A customer message in either a direct or group chat updates it.
- It is not the time when a conversation was created, opened, or closed.
- `customers[].lastVisitTime` uses the same meaning.
- Omit a bound to apply no restriction in that direction.

## Read Customer Context

After resolving customer IDs, use `search_3chat_customers_context`.

- The tool applies `conversation_start_time`, then `conversation_limit` per customer, then `message_limit` per conversation.
- Omit `conversation_start_time` for no start-time restriction; do not pass `null`.
- Include flags independently control conversation fields, custom fields, messages, and `agent_logs` on `AI_AGENT` messages.
- A successful result is at `data.results[].context.session`.
- `session.session_memory_summary` is the lifecycle communication memory.
- `session.conversations[]` contains returned conversations, and `conversations[].messages[]` contains message details.
- `reply_strategy` uses `HUMAN` or `AI_ASSISTANT`.
- `transfer_status` uses `NOT_TRANSFERRED`, `WAITING`, or `TRANSFERRED`.
- `NO_SESSION`, `NO_CONVERSATION`, and `NO_MESSAGE` mean no corresponding data was returned within this query scope. Consider filters, limits, include flags, `warnings`, and summaries; do not infer that the customer has never communicated.

Separate identity and profile facts, explicit needs, buying-stage evidence, objections, unresolved questions, recent activity, promised follow-ups, and model recommendations. Do not infer high intent, conversion, dormancy, or churn without supporting fields or messages.
