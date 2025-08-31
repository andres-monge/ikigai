# Open AI Structured Outputs Streaming

Streaming
You can use streaming to process model responses or function call arguments as they are being generated, and parse them as structured data.

That way, you don't have to wait for the entire response to complete before handling it. This is particularly useful if you would like to display JSON fields one by one, or handle function call arguments as soon as they are available.

We recommend relying on the SDKs to handle streaming with Structured Outputs.

You can find an example of how to stream function call arguments without the SDK stream helper in the function calling guide.

Here is how you can stream a model response with the stream helper:

import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
export const openai = new OpenAI();

const EntitiesSchema = z.object({
  attributes: z.array(z.string()),
  colors: z.array(z.string()),
  animals: z.array(z.string()),
});

const stream = openai.beta.chat.completions
  .stream({
    model: "gpt-4.1",
    messages: [
      { role: "system", content: "Extract entities from the input text" },
      {
        role: "user",
        content:
          "The quick brown fox jumps over the lazy dog with piercing blue eyes",
      },
    ],
    response_format: zodResponseFormat(EntitiesSchema, "entities"),
  })
  .on("refusal.done", () => console.log("request refused"))
  .on("content.delta", ({ snapshot, parsed }) => {
    console.log("content:", snapshot);
    console.log("parsed:", parsed);
    console.log();
  })
  .on("content.done", (props) => {
    console.log(props);
  });

await stream.done();

const finalCompletion = await stream.finalChatCompletion();

console.log(finalCompletion);

You can also use the stream helper to parse function call arguments:

import { zodFunction } from "openai/helpers/zod";
import OpenAI from "openai/index";
import { z } from "zod";

const GetWeatherArgs = z.object({
  city: z.string(),
  country: z.string(),
});

const client = new OpenAI();

const stream = client.beta.chat.completions
  .stream({
    model: "gpt-4.1",
    messages: [
      {
        role: "user",
        content: "What's the weather like in SF and London?",
      },
    ],
    tools: [zodFunction({ name: "get_weather", parameters: GetWeatherArgs })],
  })
  .on("tool_calls.function.arguments.delta", (props) =>
    console.log("tool_calls.function.arguments.delta", props)
  )
  .on("tool_calls.function.arguments.done", (props) =>
    console.log("tool_calls.function.arguments.done", props)
  )
  .on("refusal.delta", ({ delta }) => {
    process.stdout.write(delta);
  })
  .on("refusal.done", () => console.log("request refused"));

const completion = await stream.finalChatCompletion();

console.log("final completion:", completion);

# Vercel AI SDK


# Stream Protocols

AI SDK UI functions such as `useChat` and `useCompletion` support both text streams and data streams.
The stream protocol defines how the data is streamed to the frontend on top of the HTTP protocol.

This page describes both protocols and how to use them in the backend and frontend.

You can use this information to develop custom backends and frontends for your use case, e.g.,
to provide compatible API endpoints that are implemented in a different language such as Python.

For instance, here's an example using [FastAPI](https://github.com/vercel/ai/tree/main/examples/next-fastapi) as a backend.

## Text Stream Protocol

A text stream contains chunks in plain text, that are streamed to the frontend.
Each chunk is then appended together to form a full text response.

Text streams are supported by `useChat`, `useCompletion`, and `useObject`.
When you use `useChat` or `useCompletion`, you need to enable text streaming
by setting the `streamProtocol` options to `text`.

You can generate text streams with `streamText` in the backend.
When you call `toTextStreamResponse()` on the result object,
a streaming HTTP response is returned.

<Note>
  Text streams only support basic text data. If you need to stream other types
  of data such as tool calls, use data streams.
</Note>

### Text Stream Example

Here is a Next.js example that uses the text stream protocol:

```tsx filename='app/page.tsx'
'use client';

import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';
import { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat({
    transport: new TextStreamChatTransport({ api: '/api/chat' }),
  });

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <div key={`${message.id}-${i}`}>{part.text}</div>;
            }
          })}
        </div>
      ))}

      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          className="fixed dark:bg-zinc-900 bottom-0 w-full max-w-md p-2 mb-8 border border-zinc-300 dark:border-zinc-800 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={e => setInput(e.currentTarget.value)}
        />
      </form>
    </div>
  );
}
```

```ts filename='app/api/chat/route.ts'
import { streamText, UIMessage, convertToModelMessages } from 'ai';
import { openai } from '@ai-sdk/openai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
  });

  return result.toTextStreamResponse();
}
```

## Data Stream Protocol

A data stream follows a special protocol that the AI SDK provides to send information to the frontend.

The data stream protocol uses Server-Sent Events (SSE) format for improved standardization, keep-alive through ping, reconnect capabilities, and better cache handling.

<Note>
  When you provide data streams from a custom backend, you need to set the
  `x-vercel-ai-ui-message-stream` header to `v1`.
</Note>

The following stream parts are currently supported:

### Message Start Part

Indicates the beginning of a new message with metadata.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"start","messageId":"..."}

```

### Text Parts

Text content is streamed using a start/delta/end pattern with unique IDs for each text block.

#### Text Start Part

Indicates the beginning of a text block.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"text-start","id":"msg_68679a454370819ca74c8eb3d04379630dd1afb72306ca5d"}

```

#### Text Delta Part

Contains incremental text content for the text block.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"text-delta","id":"msg_68679a454370819ca74c8eb3d04379630dd1afb72306ca5d","delta":"Hello"}

```

#### Text End Part

Indicates the completion of a text block.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"text-end","id":"msg_68679a454370819ca74c8eb3d04379630dd1afb72306ca5d"}

```

### Reasoning Parts

Reasoning content is streamed using a start/delta/end pattern with unique IDs for each reasoning block.

#### Reasoning Start Part

Indicates the beginning of a reasoning block.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"reasoning-start","id":"reasoning_123"}

```

#### Reasoning Delta Part

Contains incremental reasoning content for the reasoning block.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"reasoning-delta","id":"reasoning_123","delta":"This is some reasoning"}

```

#### Reasoning End Part

Indicates the completion of a reasoning block.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"reasoning-end","id":"reasoning_123"}

```

### Source Parts

Source parts provide references to external content sources.

#### Source URL Part

References to external URLs.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"source-url","sourceId":"https://example.com","url":"https://example.com"}

```

#### Source Document Part

References to documents or files.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"source-document","sourceId":"https://example.com","mediaType":"file","title":"Title"}

```

### File Part

The file parts contain references to files with their media type.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"file","url":"https://example.com/file.png","mediaType":"image/png"}

```

### Data Parts

Custom data parts allow streaming of arbitrary structured data with type-specific handling.

Format: Server-Sent Event with JSON object where the type includes a custom suffix

Example:

```
data: {"type":"data-weather","data":{"location":"SF","temperature":100}}

```

The `data-*` type pattern allows you to define custom data types that your frontend can handle specifically.

### Error Part

The error parts are appended to the message as they are received.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"error","errorText":"error message"}

```

### Tool Input Start Part

Indicates the beginning of tool input streaming.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"tool-input-start","toolCallId":"call_fJdQDqnXeGxTmr4E3YPSR7Ar","toolName":"getWeatherInformation"}

```

### Tool Input Delta Part

Incremental chunks of tool input as it's being generated.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"tool-input-delta","toolCallId":"call_fJdQDqnXeGxTmr4E3YPSR7Ar","inputTextDelta":"San Francisco"}

```

### Tool Input Available Part

Indicates that tool input is complete and ready for execution.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"tool-input-available","toolCallId":"call_fJdQDqnXeGxTmr4E3YPSR7Ar","toolName":"getWeatherInformation","input":{"city":"San Francisco"}}

```

### Tool Output Available Part

Contains the result of tool execution.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"tool-output-available","toolCallId":"call_fJdQDqnXeGxTmr4E3YPSR7Ar","output":{"city":"San Francisco","weather":"sunny"}}

```

### Start Step Part

A part indicating the start of a step.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"start-step"}

```

### Finish Step Part

A part indicating that a step (i.e., one LLM API call in the backend) has been completed.

This part is necessary to correctly process multiple stitched assistant calls, e.g. when calling tools in the backend, and using steps in `useChat` at the same time.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"finish-step"}

```

### Finish Message Part

A part indicating the completion of a message.

Format: Server-Sent Event with JSON object

Example:

```
data: {"type":"finish"}

```

### Stream Termination

The stream ends with a special `[DONE]` marker.

Format: Server-Sent Event with literal `[DONE]`

Example:

```
data: [DONE]

```

The data stream protocol is supported
by `useChat` and `useCompletion` on the frontend and used by default.
`useCompletion` only supports the `text` and `data` stream parts.

On the backend, you can use `toUIMessageStreamResponse()` from the `streamText` result object to return a streaming HTTP response.

### UI Message Stream Example

Here is a Next.js example that uses the UI message stream protocol:

```tsx filename='app/page.tsx'
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat();

  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(message => (
        <div key={message.id} className="whitespace-pre-wrap">
          {message.role === 'user' ? 'User: ' : 'AI: '}
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <div key={`${message.id}-${i}`}>{part.text}</div>;
            }
          })}
        </div>
      ))}

      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          className="fixed dark:bg-zinc-900 bottom-0 w-full max-w-md p-2 mb-8 border border-zinc-300 dark:border-zinc-800 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={e => setInput(e.currentTarget.value)}
        />
      </form>
    </div>
  );
}
```

```ts filename='app/api/chat/route.ts'
import { openai } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages } from 'ai';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```


# Streaming Custom Data

It is often useful to send additional data alongside the model's response.
For example, you may want to send status information, the message ids after storing them,
or references to content that the language model is referring to.

The AI SDK provides several helpers that allows you to stream additional data to the client
and attach it to the `UIMessage` parts array:

- `createUIMessageStream`: creates a data stream
- `createUIMessageStreamResponse`: creates a response object that streams data
- `pipeUIMessageStreamToResponse`: pipes a data stream to a server response object

The data is streamed as part of the response stream using Server-Sent Events.

## Setting Up Type-Safe Data Streaming

First, define your custom message type with data part schemas for type safety:

```tsx filename="ai/types.ts"
import { UIMessage } from 'ai';

// Define your custom message type with data part schemas
export type MyUIMessage = UIMessage<
  never, // metadata type
  {
    weather: {
      city: string;
      weather?: string;
      status: 'loading' | 'success';
    };
    notification: {
      message: string;
      level: 'info' | 'warning' | 'error';
    };
  } // data parts type
>;
```

## Streaming Data from the Server

In your server-side route handler, you can create a `UIMessageStream` and then pass it to `createUIMessageStreamResponse`:

```tsx filename="route.ts"
import { openai } from '@ai-sdk/openai';
import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  convertToModelMessages,
} from 'ai';
import { MyUIMessage } from '@/ai/types';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = createUIMessageStream<MyUIMessage>({
    execute: ({ writer }) => {
      // 1. Send initial status (transient - won't be added to message history)
      writer.write({
        type: 'data-notification',
        data: { message: 'Processing your request...', level: 'info' },
        transient: true, // This part won't be added to message history
      });

      // 2. Send sources (useful for RAG use cases)
      writer.write({
        type: 'source',
        value: {
          type: 'source',
          sourceType: 'url',
          id: 'source-1',
          url: 'https://weather.com',
          title: 'Weather Data Source',
        },
      });

      // 3. Send data parts with loading state
      writer.write({
        type: 'data-weather',
        id: 'weather-1',
        data: { city: 'San Francisco', status: 'loading' },
      });

      const result = streamText({
        model: openai('gpt-4.1'),
        messages: convertToModelMessages(messages),
        onFinish() {
          // 4. Update the same data part (reconciliation)
          writer.write({
            type: 'data-weather',
            id: 'weather-1', // Same ID = update existing part
            data: {
              city: 'San Francisco',
              weather: 'sunny',
              status: 'success',
            },
          });

          // 5. Send completion notification (transient)
          writer.write({
            type: 'data-notification',
            data: { message: 'Request completed', level: 'info' },
            transient: true, // Won't be added to message history
          });
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

<Note>
  You can also send stream data from custom backends, e.g. Python / FastAPI,
  using the [UI Message Stream
  Protocol](/docs/ai-sdk-ui/stream-protocol#ui-message-stream-protocol).
</Note>

## Types of Streamable Data

### Data Parts (Persistent)

Regular data parts are added to the message history and appear in `message.parts`:

```tsx
writer.write({
  type: 'data-weather',
  id: 'weather-1', // Optional: enables reconciliation
  data: { city: 'San Francisco', status: 'loading' },
});
```

### Sources

Sources are useful for RAG implementations where you want to show which documents or URLs were referenced:

```tsx
writer.write({
  type: 'source',
  value: {
    type: 'source',
    sourceType: 'url',
    id: 'source-1',
    url: 'https://example.com',
    title: 'Example Source',
  },
});
```

### Transient Data Parts (Ephemeral)

Transient parts are sent to the client but not added to the message history. They are only accessible via the `onData` useChat handler:

```tsx
// server
writer.write({
  type: 'data-notification',
  data: { message: 'Processing...', level: 'info' },
  transient: true, // Won't be added to message history
});

// client
const [notification, setNotification] = useState();

const { messages } = useChat({
  onData: ({ data, type }) => {
    if (type === 'data-notification') {
      setNotification({ message: data.message, level: data.level });
    }
  },
});
```

## Data Part Reconciliation

When you write to a data part with the same ID, the client automatically reconciles and updates that part. This enables powerful dynamic experiences like:

- **Collaborative artifacts** - Update code, documents, or designs in real-time
- **Progressive data loading** - Show loading states that transform into final results
- **Live status updates** - Update progress bars, counters, or status indicators
- **Interactive components** - Build UI elements that evolve based on user interaction

The reconciliation happens automatically - simply use the same `id` when writing to the stream.

## Processing Data on the Client

### Using the onData Callback

The `onData` callback is essential for handling streaming data, especially transient parts:

```tsx filename="page.tsx"
import { useChat } from '@ai-sdk/react';
import { MyUIMessage } from '@/ai/types';

const { messages } = useChat<MyUIMessage>({
  api: '/api/chat',
  onData: dataPart => {
    // Handle all data parts as they arrive (including transient parts)
    console.log('Received data part:', dataPart);

    // Handle different data part types
    if (dataPart.type === 'data-weather') {
      console.log('Weather update:', dataPart.data);
    }

    // Handle transient notifications (ONLY available here, not in message.parts)
    if (dataPart.type === 'data-notification') {
      showToast(dataPart.data.message, dataPart.data.level);
    }
  },
});
```

**Important:** Transient data parts are **only** available through the `onData` callback. They will not appear in the `message.parts` array since they're not added to message history.

### Rendering Persistent Data Parts

You can filter and render data parts from the message parts array:

```tsx filename="page.tsx"
const result = (
  <>
    {messages?.map(message => (
      <div key={message.id}>
        {/* Render weather data parts */}
        {message.parts
          .filter(part => part.type === 'data-weather')
          .map((part, index) => (
            <div key={index} className="weather-widget">
              {part.data.status === 'loading' ? (
                <>Getting weather for {part.data.city}...</>
              ) : (
                <>
                  Weather in {part.data.city}: {part.data.weather}
                </>
              )}
            </div>
          ))}

        {/* Render text content */}
        {message.parts
          .filter(part => part.type === 'text')
          .map((part, index) => (
            <div key={index}>{part.text}</div>
          ))}

        {/* Render sources */}
        {message.parts
          .filter(part => part.type === 'source')
          .map((part, index) => (
            <div key={index} className="source">
              Source: <a href={part.url}>{part.title}</a>
            </div>
          ))}
      </div>
    ))}
  </>
);
```

### Complete Example

```tsx filename="page.tsx"
'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';
import { MyUIMessage } from '@/ai/types';

export default function Chat() {
  const [input, setInput] = useState('');

  const { messages, sendMessage } = useChat<MyUIMessage>({
    api: '/api/chat',
    onData: dataPart => {
      // Handle transient notifications
      if (dataPart.type === 'data-notification') {
        console.log('Notification:', dataPart.data.message);
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage({ text: input });
    setInput('');
  };

  return (
    <>
      {messages?.map(message => (
        <div key={message.id}>
          {message.role === 'user' ? 'User: ' : 'AI: '}

          {/* Render weather data */}
          {message.parts
            .filter(part => part.type === 'data-weather')
            .map((part, index) => (
              <span key={index} className="weather-update">
                {part.data.status === 'loading' ? (
                  <>Getting weather for {part.data.city}...</>
                ) : (
                  <>
                    Weather in {part.data.city}: {part.data.weather}
                  </>
                )}
              </span>
            ))}

          {/* Render text content */}
          {message.parts
            .filter(part => part.type === 'text')
            .map((part, index) => (
              <div key={index}>{part.text}</div>
            ))}
        </div>
      ))}

      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about the weather..."
        />
        <button type="submit">Send</button>
      </form>
    </>
  );
}
```

## Use Cases

- **RAG Applications** - Stream sources and retrieved documents
- **Real-time Status** - Show loading states and progress updates
- **Collaborative Tools** - Stream live updates to shared artifacts
- **Analytics** - Send usage data without cluttering message history
- **Notifications** - Display temporary alerts and status messages

## Message Metadata vs Data Parts

Both [message metadata](/docs/ai-sdk-ui/message-metadata) and data parts allow you to send additional information alongside messages, but they serve different purposes:

### Message Metadata

Message metadata is best for **message-level information** that describes the message as a whole:

- Attached at the message level via `message.metadata`
- Sent using the `messageMetadata` callback in `toUIMessageStreamResponse`
- Ideal for: timestamps, model info, token usage, user context
- Type-safe with custom metadata types

```ts
// Server: Send metadata about the message
return result.toUIMessageStreamResponse({
  messageMetadata: ({ part }) => {
    if (part.type === 'finish') {
      return {
        model: part.response.modelId,
        totalTokens: part.totalUsage.totalTokens,
        createdAt: Date.now(),
      };
    }
  },
});
```

### Data Parts

Data parts are best for streaming **dynamic arbitrary data**:

- Added to the message parts array via `message.parts`
- Streamed using `createUIMessageStream` and `writer.write()`
- Can be reconciled/updated using the same ID
- Support transient parts that don't persist
- Ideal for: dynamic content, loading states, interactive components

```ts
// Server: Stream data as part of message content
writer.write({
  type: 'data-weather',
  id: 'weather-1',
  data: { city: 'San Francisco', status: 'loading' },
});
```

For more details on message metadata, see the [Message Metadata documentation](/docs/ai-sdk-ui/message-metadata).


# Response

The `Response` component renders a Markdown response from a large language model. It uses [Streamdown](https://streamdown.ai/) under the hood to render the markdown.

<Preview path="response" />

## Installation

```sh
npx ai-elements@latest add response
```

## Usage

```tsx
import { Response } from '@/components/ai-elements/response';
```

```tsx
<Response>**Hi there.** I am an AI model designed to help you.</Response>
```

## Usage with AI SDK

Populate a markdown response with messages from [`useChat`](/docs/reference/ai-sdk-ui/use-chat).

Add the following component to your frontend:

```tsx filename="app/page.tsx"
'use client';

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import { Message, MessageContent } from '@/components/ai-elements/message';
import { useChat } from '@ai-sdk/react';
import { Response } from '@/components/ai-elements/response';

const ResponseDemo = () => {
  const { messages } = useChat();

  return (
    <div className="max-w-4xl mx-auto p-6 relative size-full rounded-lg border h-[600px]">
      <div className="flex flex-col h-full">
        <Conversation>
          <ConversationContent>
            {messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, i) => {
                    switch (part.type) {
                      case 'text': // we don't use any reasoning or tool calls in this example
                        return (
                          <Response key={`${message.id}-${i}`}>
                            {part.text}
                          </Response>
                        );
                      default:
                        return null;
                    }
                  })}
                </MessageContent>
              </Message>
            ))}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      </div>
    </div>
  );
};

export default ResponseDemo;
```

## Features

- Renders markdown content with support for paragraphs, links, and code blocks
- Supports GFM features like tables, task lists, and strikethrough text via remark-gfm
- Supports rendering Math Equations via rehype-katex
- **Smart streaming support** - automatically completes incomplete formatting during real-time text streaming
- Code blocks are rendered with syntax highlighting for various programming languages
- Code blocks include a button to easily copy code to clipboard
- Adapts to different screen sizes while maintaining readability
- Seamlessly integrates with both light and dark themes
- Customizable appearance through className props and Tailwind CSS utilities
- Built with accessibility in mind for all users

## Props

### `<Response />`

<PropertiesTable
  content={[
    {
      name: 'children',
      type: 'string',
      description: 'The markdown content to render.',
    },
    {
      name: 'parseIncompleteMarkdown',
      type: 'boolean',
      description: 'Whether to parse and fix incomplete markdown syntax (e.g., unclosed code blocks or lists).',
      default: 'true',
      isOptional: true,
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class names to apply to the wrapper div element.',
      isOptional: true,
    },
    {
      name: 'components',
      type: 'object',
      description: 'Custom React components to use for rendering markdown elements (e.g., custom heading, paragraph, code block components).',
      isOptional: true,
    },
    {
      name: 'allowedImagePrefixes',
      type: 'string[]',
      description: 'Array of allowed URL prefixes for images. Use ["*"] to allow all images.',
      default: '["*"]',
      isOptional: true,
    },
    {
      name: 'allowedLinkPrefixes',
      type: 'string[]',
      description: 'Array of allowed URL prefixes for links. Use ["*"] to allow all links.',
      default: '["*"]',
      isOptional: true,
    },
    {
      name: 'defaultOrigin',
      type: 'string',
      description: 'Default origin to use for relative URLs in links and images.',
      isOptional: true,
    },
    {
      name: 'rehypePlugins',
      type: 'array',
      description: 'Array of rehype plugins to use for processing HTML. Includes KaTeX for math rendering by default.',
      default: '[rehypeKatex]',
      isOptional: true,
    },
    {
      name: 'remarkPlugins',
      type: 'array',
      description: 'Array of remark plugins to use for processing markdown. Includes GitHub Flavored Markdown and math support by default.',
      default: '[remarkGfm, remarkMath]',
      isOptional: true,
    },
    {
      name: '[...props]',
      type: 'React.HTMLAttributes<HTMLDivElement>',
      description: 'Any other props are spread to the root div.',
      isOptional: true,
    },
  ]}
/>
