export const REGIONS = {
  "cn": {
    "id": "cn",
    "locale": "zh",
    "title": "3Chat 私域客户运营",
    "description": "通过微信、企业微信、小红书、抖音等已连接渠道查询、筛选客户。向单个或批量客户定向发送个性化消息。客户产生回复后，已配置的 3Chat Agent 可接续上下文，提供 7×24 小时自主接待，持续完成需求沟通、产品答疑、异议处理和购买引导，帮助商家将客户洞察转化为真实触达和成交机会",
    "serverUrl": "https://app.3chatai.cn/mcp",
    "website": "https://www.3chatai.cn/",
    "credentialKey": "threechat-mcp/oauth",
    "examples": [
      "我昨天有哪些新客户？",
      "给林女士拟一条跟进信息",
      "把这张活动图片和介绍，发给张先生"
    ]
  },
  "global": {
    "id": "global",
    "locale": "en",
    "title": "3Chat Customer Growth",
    "description": "Run customer outreach across Instagram, Facebook Messenger, and WhatsApp from DeepSeek Harness. Review customer context, prepare personalized messages, and send through connected 3Chat channels after your confirmation. When customers reply, your configured 3Chat Agent can continue the conversation 24/7, answer questions, handle objections, and guide the next step or hand off to a person. Access and actions follow your organization’s 3Chat permissions.",
    "serverUrl": "https://app.3chat.ai/mcp",
    "website": "https://3chat.ai",
    "credentialKey": "threechat-global/oauth",
    "examples": [
      "What new clients did I get yesterday?",
      "Draft a follow-up message for Ms. Lin.",
      "Send this event photo and introduction to Mr. Zhang."
    ]
  }
};

export function regionForLocale(locale) {
  return /^zh(?:[-_]|$)/i.test(String(locale ?? "")) ? REGIONS.cn : REGIONS.global;
}
