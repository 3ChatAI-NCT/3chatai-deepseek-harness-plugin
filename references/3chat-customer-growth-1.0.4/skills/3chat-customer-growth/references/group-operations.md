# Group Operations

## Search Groups

Use `search_3chat_groups` to resolve groups, sender accounts, or members.

- `groups[].group_id` is the canonical ID for context and send tools.
- `groups[].channel_type` identifies the messaging channel.
- `groups[].managed_accounts[]` lists connected accounts eligible to send; use a `channel_account_id` from the same group. `managed_accounts[]` may be empty when every connected sender account has left the group. In that extreme case the group cannot receive outbound messages.

- If multiple sender accounts are valid and intent is unclear, ask the user to choose.
- With `include_members=true`, members include `participant_id`, `customerName`, `groupNickName`, and linked `customer_id`.
- `member_type` uses `COLLEAGUE`, `CUSTOMER`, or `MANAGED_ACCOUNT`; `role` uses `ADMIN` or `MEMBER`.
- Never substitute `external_group_id`, `imRoomId`, or `im_bot_id` for `group_id` or `channel_account_id`.

## Read Group Context

Use `search_3chat_groups_context` after resolving group IDs.

- Limits are applied in the same order as customer context: time filter, conversation count, then messages per conversation.
- A successful result is at `data.results[].context.session`; a group session has `session_type: group`.
- `session_memory_summary` is the group lifecycle memory.
- `reply_strategy` uses `HUMAN` or `AI_ASSISTANT`.
- `agent_logs` belongs only to `AI_AGENT` messages.
- `NO_SESSION`, `NO_CONVERSATION`, and `NO_MESSAGE` are normal no-data outcomes within the current query scope.

For a private follow-up to a group member, prefer the member's linked `customer_id` instead of fuzzy matching the member name again.
