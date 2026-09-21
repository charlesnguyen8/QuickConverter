# DeepSeek Web-to-API Bridge — API Documentation

This document provides complete technical specifications for the local DeepSeek Web-to-API Bridge server. The server implements the official **OpenAI REST API specification**, allowing it to serve as a drop-in replacement for any client, tool, extension, or SDK.

---

> [!IMPORTANT]
> ### ⭐️ Strongly Recommended: Use `stream: true` for All API Usage
> When integrating with AI tools, IDE extensions (Cursor, Continue, Cline), or HTTP clients, **always enable streaming (`"stream": true`)**.
> 
> * **Prevents Client Timeouts**: Reasoning models (DeepSeek-R1) often think and generate for 60–120+ seconds. Non-streaming leaves the HTTP connection completely silent with 0 bytes transmitted, causing clients or HTTP libraries with 60s/120s/180s read timeouts to terminate prematurely. Streaming sends token chunks continuously, keeping the TCP socket active and resetting your client's read timer on every token.
> * **Real-Time Thinking Stream**: You receive `reasoning_content` deltas as the model reasons, giving instant feedback rather than waiting minutes in total silence.
> * **Standard Protocol**: Every modern OpenAI client and agent framework natively supports and prefers streaming Server-Sent Events (SSE).

---

## 1. General Configuration

| Setting | Value |
| :--- | :--- |
| **Server Address** | `http://127.0.0.1:8000` *(default)* |
| **OpenAI Base URL** | `http://127.0.0.1:8000/v1` |
| **Authentication** | Any non-empty Bearer token (e.g. `Authorization: Bearer sk-local`) |
| **Content-Type** | `application/json` |

---

## 2. Supported Models

The server dynamically translates model identifiers into corresponding web chat toggle states (DeepThink R1 and Web Search):

| Model Identifier | DeepThink (R1) | Web Search | Description |
| :--- | :---: | :---: | :--- |
| **`deepseek-chat`** *(or `deepseek-flash`)* | OFF | OFF | High-throughput standard chat powered by V4.1-Flash. |
| **`deepseek-chat-search`** | OFF | **ON** | Fast chat augmented with real-time web search results. |
| **`deepseek-reasoner`** *(or `deepseek-r1`)* | **ON** | OFF | In-depth chain-of-thought reasoning mode. |
| **`deepseek-reasoner-search`** *(or `deepseek-r1-search`)* | **ON** | **ON** | **Dual-Toggle**: Deep reasoning backed by live web search. |

> [!TIP]
> **Dynamic Overrides**: You can also pass explicit boolean fields `"web_search": true` or `"deep_think": true` in the JSON request body to override model defaults regardless of the model name requested.

---

## 3. Endpoints

### 3.1 List Models

Retrieve the list of models supported by the local bridge.

- **Method**: `GET`
- **Path**: `/v1/models` (or `/models`)

#### Response (`200 OK`)
```json
{
  "object": "list",
  "data": [
    {
      "id": "deepseek-chat",
      "object": "model",
      "owned_by": "deepseek",
      "description": "Standard Fast Chat (V4.1-Flash)"
    },
    {
      "id": "deepseek-flash",
      "object": "model",
      "owned_by": "deepseek",
      "description": "Alias for deepseek-chat"
    },
    {
      "id": "deepseek-chat-search",
      "object": "model",
      "owned_by": "deepseek",
      "description": "Fast Chat with Live Web Search"
    },
    {
      "id": "deepseek-reasoner",
      "object": "model",
      "owned_by": "deepseek",
      "description": "DeepThink (R1) Reasoning Mode"
    },
    {
      "id": "deepseek-r1",
      "object": "model",
      "owned_by": "deepseek",
      "description": "Alias for deepseek-reasoner"
    },
    {
      "id": "deepseek-reasoner-search",
      "object": "model",
      "owned_by": "deepseek",
      "description": "Dual Toggle: DeepThink Reasoning + Live Web Search"
    },
    {
      "id": "deepseek-r1-search",
      "object": "model",
      "owned_by": "deepseek",
      "description": "Alias for deepseek-reasoner-search"
    }
  ]
}
```

---

### 3.2 Create Chat Completion

Creates a model response for the given chat conversation.

- **Method**: `POST`
- **Path**: `/v1/chat/completions` (or `/chat/completions`)

#### Request Headers
```http
Content-Type: application/json
Authorization: Bearer sk-local
```

#### Request Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :---: | :---: | :---: | :--- |
| `model` | string | **Yes** | `"deepseek-chat"` | Model ID from the supported list. |
| `messages` | array | **Yes** | — | A list of message objects comprising the conversation history. |
| `messages[].role` | string | **Yes** | — | `"system"`, `"user"`, or `"assistant"`. |
| `messages[].content` | string | **Yes** | — | The text content of the message. |
| `stream` | boolean | No | `false` | **Recommended: `true`**. If `true`, returns SSE token stream. |
| `deep_think` | boolean | No | *Derived* | Explicit override for the DeepThink (R1) toggle. |
| `web_search` | boolean | No | *Derived* | Explicit override for the Web Search toggle. |
| `temperature` | float | No | `1.0` | Accepted for protocol compliance. |
| `max_tokens` | integer | No | `null` | Accepted for protocol compliance. |

---

### Recommended Mode: Streaming (`stream: true`)

Streams token chunks in real time as Server-Sent Events (`Content-Type: text/event-stream`). **This is the recommended mode for all interactive and agent tools.**

#### Example Request
```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-local" \
  -d '{
    "model": "deepseek-reasoner",
    "messages": [
      {"role": "user", "content": "Which is bigger: 9.9 or 9.11? Explain briefly."}
    ],
    "stream": true
  }'
```

#### Event Stream Format
The stream emits data chunks formatted identically to OpenAI's SSE format:

1. **Role Header**:
   ```text
   data: {"id":"chatcmpl-1a2b","object":"chat.completion.chunk","created":1789943050,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}
   ```

2. **Reasoning Tokens (`reasoning_content`)** *(when using R1 / deepseek-reasoner)*:
   ```text
   data: {"id":"chatcmpl-1a2b","object":"chat.completion.chunk","created":1789943050,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"reasoning_content":"Comparing 9.9 and 9.11..."},"finish_reason":null}]}
   ```

3. **Content Tokens (`content`)**:
   ```text
   data: {"id":"chatcmpl-1a2b","object":"chat.completion.chunk","created":1789943050,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{"content":"9.9 is larger than 9.11."},"finish_reason":null}]}
   ```

4. **Stream Termination**:
   ```text
   data: {"id":"chatcmpl-1a2b","object":"chat.completion.chunk","created":1789943050,"model":"deepseek-reasoner","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}

   data: [DONE]
   ```

---

### Non-Streaming Mode (`stream: false`)

Waits until generation is 100% complete, cleans up the chat session, and returns a single JSON object.

> [!WARNING]
> Use non-streaming only for short, predictable queries with fast models (`deepseek-chat`). For long prompts or reasoning queries with `deepseek-reasoner`, use `stream: true` to prevent client read timeouts.

#### Example Request
```bash
curl http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-local" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {"role": "user", "content": "What is 15 + 27?"}
    ],
    "stream": false
  }'
```

#### Example Response (`200 OK`)
```json
{
  "id": "chatcmpl-7d30e7292cff",
  "object": "chat.completion",
  "created": 1789943050,
  "model": "deepseek-chat",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "42"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 5,
    "completion_tokens": 1,
    "total_tokens": 6
  }
}
```

---

## 4. Single-Request Lifecycle & Auto-Cleanup

To keep your DeepSeek account clean and maintain maximum context window availability, every request automatically executes this lifecycle:

```
1. Client Request Received (HTTP POST /v1/chat/completions)
          │
          ▼
2. Request Serializer (Acquires asyncio.Lock FIFO)
          │
          ▼
3. Clean Slate: Clicks 'New chat' (or navigates to /)
          │
          ▼
4. Model Configuration: Sets DeepThink & Search toggles
          │
          ▼
5. Stealth Input Dispatch: Humanized keystroke jitter / paste
          │
          ▼
6. Response Delivery: Real-time SSE stream or single JSON payload
          │
          ▼
7. Auto-Deletion: Expands sidebar drawer if collapsed (half-screen responsive mode)
                  -> Hovers active chat -> Clicks Delete -> Confirms
                  -> Collapses sidebar drawer so textarea is clear
          │
          ▼
8. Cooldown Jitter: Holds lock for 1.8s - 3.5s human dwell delay
          │
          ▼
9. Lock Released for Next Queued Request
```

---

## 5. Error Codes & Circuit Breakers

| HTTP Status | Error Type | Cause | Recommended Action |
| :---: | :--- | :--- | :--- |
| **`400`** | `bad_request` | Empty prompt or invalid JSON payload. | Provide at least one valid user message. |
| **`429`** | `rate_limit_exceeded` | DeepSeek web usage limit banner detected on page. | Wait a few minutes before sending next request. |
| **`503`** | `challenge_required` | Cloudflare Turnstile or CAPTCHA detected. | Complete the verification manually in the open Chromium window; automation safely resumes. |
| **`504`** | `timeout` | DeepSeek generation exceeded 180 seconds. | Use `"stream": true` to eliminate client read timeouts, or shorten the prompt. |
| **`502`** | `browser_disconnected` | Chromium was closed or port 9222 disconnected. | Double-click `run.bat` to reopen Chromium and reconnect. |

---

## 6. Code Integration Examples

### 6.1 Python (`openai` SDK) — Streaming (Recommended)
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8000/v1",
    api_key="sk-local"  # Any non-empty dummy key
)

# Stream reasoning and content in real-time
response = client.chat.completions.create(
    model="deepseek-reasoner",
    messages=[
        {"role": "system", "content": "You are a concise research assistant."},
        {"role": "user", "content": "Explain quantum superposition in 2 sentences."}
    ],
    stream=True  # Recommended!
)

for chunk in response:
    delta = chunk.choices[0].delta
    # Stream DeepThink R1 thought process
    if hasattr(delta, "reasoning_content") and delta.reasoning_content:
        print(f"[THINK] {delta.reasoning_content}", end="", flush=True)
    # Stream final response content
    if delta.content:
        print(delta.content, end="", flush=True)

print()
```

### 6.2 JavaScript / TypeScript — Streaming (Recommended)
```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "http://127.0.0.1:8000/v1",
  apiKey: "sk-local",
});

async function main() {
  const stream = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: "Write a hello world in Rust." }],
    stream: true, // Recommended!
  });

  for await (const chunk of stream) {
    process.stdout.write(chunk.choices[0]?.delta?.content || "");
  }
  console.log();
}

main();
```

---

## 7. Tool Integrations

### Continue.dev (`config.json`)
```json
{
  "models": [
    {
      "title": "DeepSeek R1 (Local Web)",
      "provider": "openai",
      "model": "deepseek-reasoner",
      "apiBase": "http://127.0.0.1:8000/v1",
      "apiKey": "sk-local"
    },
    {
      "title": "DeepSeek V3 (Local Web)",
      "provider": "openai",
      "model": "deepseek-chat",
      "apiBase": "http://127.0.0.1:8000/v1",
      "apiKey": "sk-local"
    }
  ]
}
```

### LibreChat (`librechat.yaml`)
```yaml
endpoints:
  custom:
    - name: "DeepSeek Web"
      apiKey: "sk-local"
      baseURL: "http://127.0.0.1:8000/v1"
      models:
        default: ["deepseek-chat", "deepseek-chat-search", "deepseek-reasoner", "deepseek-reasoner-search"]
        fetch: true
      streamRate: 20
```

### Open WebUI
1. Go to **Settings** $\rightarrow$ **Connections** $\rightarrow$ **OpenAI API**.
2. Set URL to: `http://127.0.0.1:8000/v1`
3. Set API Key to: `sk-local`
4. Verify connection; all 7 model variations will appear automatically.
