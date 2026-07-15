// Polyfill WHATWG Streams (TransformStream, ReadableStream, WritableStream) in
// the jsdom test environment. jsdom does not expose Node.js globals by default,
// so tests that exercise code paths using the streams API would otherwise throw
// "TransformStream is not defined".
import { ReadableStream, WritableStream, TransformStream } from "stream/web";

Object.assign(globalThis, { ReadableStream, WritableStream, TransformStream });
