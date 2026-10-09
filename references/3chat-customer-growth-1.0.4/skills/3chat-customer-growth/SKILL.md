---
name: 3chat-customer-growth
description: Use 3Chat when users need to search, segment, or analyze customers, conversations, and groups; review communication context; prepare or send explicitly confirmed customer or group messages with attachments or approved WhatsApp templates; or track batch sends. Do not use for customer-record updates or 3Chat Agent configuration.
---

# 3Chat Customer Growth

Use this skill for customer discovery, conversation filtering, customer or group communication analysis, outreach preparation, confirmed message delivery, and batch-send tracking in 3Chat.

## Dependency

This skill depends on the MCP server named `3chat-customer-growth`. Use only tools currently exposed by that server and parameters present in each tool's live `inputSchema`.

## Available Tools

### Search and analysis

- `search_3chat_customers`: Search customers by standard fields, custom fields, latest inquiry time, and other supported conditions.
- `search_3chat_conversations`: Search direct or group conversation entities with pagination; it does not return message details.
- `search_3chat_customers_context`: Read customer memory, conversations, messages, custom fields, and optional `agent_logs` in batches.
- `search_3chat_groups`: Search groups, connected sender accounts, and optional group members.
- `search_3chat_groups_context`: Read group memory, conversations, messages, custom fields, and optional `agent_logs` in batches.

### Attachments and messaging

- `upload_3chat_attachment`: Upload a file when no valid final download URL is available.
- `send_3chat_customer_message`: Send a message to one specified customer.
- `send_3chat_customer_messages`: Batch send messages to specified customers.
- `send_3chat_customer_whatsapp_template`: Send an approved WhatsApp template through YCloud.
- `send_3chat_group_message`: Send a message to one specified group.
- `send_3chat_group_messages`: Batch send messages to specified groups.
- `get_3chat_batch_send_status`: Get progress and item results for customer or group batch jobs.

## Core Rules

1. Classify the request as customer search, conversation search, full-context retrieval, analysis, drafting, sending, or job-status tracking before selecting a tool.
2. Use canonical 3Chat IDs returned by search tools. Never substitute display names, external group IDs, `imRoomId`, or `im_bot_id` where a canonical ID is required.
3. Preserve multiple valid results for lists, statistics, comparisons, and analysis. Ask the user to select only when the next action requires one target and intent is ambiguous.
4. Drafting, analysis, and audience selection do not authorize sending. Before any send, show the exact recipients, sender account or channel, final content, attachments, and scope, then obtain explicit confirmation.
5. Use an existing final HTTP/HTTPS download URL only when it needs no authentication or custom headers and is neither a preview page nor redirect-only link. Otherwise call `upload_3chat_attachment` and prefer reusing the complete `data.attachment` object.
6. After a batch returns `job_id`, call only `get_3chat_batch_send_status` for that job; never recreate the batch.
7. Follow structured error fields and `aiAction`. Retry a send with identical business parameters and the original idempotency key only for `RETRY_SAME_REQUEST`.
8. Do not expose raw JSON by default. Separate 3Chat facts from model inference, and never equate `accepted`, `sent`, or `COMPLETED` with channel delivery or read status.

## Detailed Guidance

- Customer filters, `query_mode`, `last_visit_time`, and customer context: read [references/customer-intelligence.md](references/customer-intelligence.md).
- Direct conversation search and conversation fields: read [references/conversation-search.md](references/conversation-search.md).
- Group discovery, members, and sender accounts: read [references/group-operations.md](references/group-operations.md).
- Before uploading or sending: read [references/outbound-messaging.md](references/outbound-messaging.md).
- For no-data, partial, error, or retry outcomes: read [references/errors-and-retries.md](references/errors-and-retries.md).
- For representative end-to-end workflows and tool-selection examples: read [references/use-cases.md](references/use-cases.md).

## Current Boundary

Use only the twelve public tools listed above. Do not call internal channel lookup tools or claim support for customer-record updates, campaign or scheduling objects, 3Chat Agent configuration, or server-side aggregate analytics that the current tools do not expose.
