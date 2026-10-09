# Conversation Search

## When to Use It

Use `search_3chat_conversations` to filter, page, count, or locate conversation entities, such as conversations in a time period, transferred conversations, conversations handled by AI or humans, unresolved conversations, or conversations for a channel account.

This tool does not return message details, session memory, custom fields, or `agent_logs`. Use the appropriate customer or group context tool when those are required.

## Filter Rules

- Populated fields use AND semantics; all parameters may be omitted.
- `customer_id` and `group_id` are mutually exclusive.
- With `customer_id`, `session_type` must be omitted or `p2p`.
- With `group_id`, `session_type` must be omitted or `group`.
- `reply_strategy` uses only `HUMAN` and `AI_ASSISTANT`.
- `transfer_status` uses `NOT_TRANSFERRED`, `WAITING`, or `TRANSFERRED`.
- `status` uses `ACTIVE`, `COMPLETED`, or `PAUSED`.
- `solved=false` is a valid filter and must not be treated as absent.
- `time_field` selects both the time filter and descending sort field; it defaults to `created_time`.
- `start_time` and `end_time` are Unix timestamps in milliseconds and may be supplied independently; when both exist, the end must not precede the start.
- `offset` defaults to 0; `limit` defaults to 20 and ranges from 1 to 100.

The tool returns `data.total`, `data.offset`, `data.limit`, and `data.conversations[]`. An empty array with `total=0` is a normal result. A conversation `summary` is not the full transcript; retrieve context messages when exact wording matters.
