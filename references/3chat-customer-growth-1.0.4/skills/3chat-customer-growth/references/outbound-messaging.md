# Outbound Messaging

Sending changes external state. Do not call a send tool when the user only requests analysis, audience selection, drafting, or preview.

## Confirmation

Immediately before sending, show the exact customers or groups, sender account or channel, final text, attachments, and single or batch scope. Send only after explicit confirmation. Reconfirm after any business parameter changes.

## Attachments

- Use an existing final directly downloadable HTTP/HTTPS URL when available.
- The URL must not require authentication, custom headers, an interactive page, or redirect-only short link.
- Otherwise call `upload_3chat_attachment`.
- Prefer passing the complete returned `data.attachment` into `attachments`; at minimum pass `data.attachment.url`.
- Never shorten, rewrite, escape, or Markdown-wrap the URL.
- Successful upload does not mean a message was sent.

## Single and Batch Sends

- Customer single send: use `send_3chat_customer_message` with one resolved `customer_id`.
- Group single send: use `send_3chat_group_message` with canonical `group_id` and a `channel_account_id` from that group's `managed_accounts[]`.
- Generate a stable idempotency key for one logical send; reuse it only for an explicitly permitted same-request retry.
- Customer batches support at most 100 items; prefer 1 to 3.
- Group batches should normally contain 1 to 3 items; group IDs and idempotency keys must be unique within the batch.
- Every `items[]` entry has its own confirmation token and idempotency key.
- After receiving `job_id`, query the original task and never recreate the batch.
- `data.results[].success` determines whether each item was processed successfully.

## WhatsApp Templates

Use `send_3chat_customer_whatsapp_template` for approved templates, especially outside the WhatsApp 24-hour service window.

- The customer must be associated with a YCloud channel in the current tenant.
- An explicit `channel_account_id` must match that association.
- Pass numbered or named variables as a mapping; do not render a free-form body in place of the template.
- A media-header template requires matching `header_media`.
- Confirm the customer, account, template, language, variables, and media before sending.

`accepted`, `sent`, and `COMPLETED` are processing states, not proof of channel delivery or read status.
