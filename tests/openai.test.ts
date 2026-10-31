import { expect, test } from 'bun:test';
import { createCoach } from '../apps/server/src/coach';
import { emptySnapshot, type CoachInput } from '../packages/shared/domain';
test('OpenAI Responses integration sends bounded, stateless seven-day context', async () => {
  let captured: Record<string, unknown> | null = null;
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    async fetch(req) {
      expect(new URL(req.url).pathname).toBe('/v1/responses');
      expect(req.headers.get('authorization')).toBe('Bearer test-not-a-real-key');
      captured = (await req.json()) as Record<string, unknown>;
      return Response.json({
        id: 'resp_local_test',
        object: 'response',
        created_at: 0,
        status: 'completed',
        model: 'test-model',
        output: [
          {
            id: 'msg_local_test',
            type: 'message',
            status: 'completed',
            role: 'assistant',
            content: [
              { type: 'output_text', text: 'A focused block and a proper break.', annotations: [] },
            ],
          },
        ],
      });
    },
  });
  try {
    const coach = createCoach({
      apiKey: 'test-not-a-real-key',
      model: 'test-model',
      baseURL: `http://127.0.0.1:${server.port}/v1`,
    });
    const input: CoachInput = {
      requestId: crypto.randomUUID(),
      question: 'Help me plan',
      from: '2026-10-25',
      to: '2026-10-31',
      timezone: 'Asia/Tehran',
      categories: emptySnapshot().categories,
      activities: [
        {
          id: 'a',
          date: '2026-10-31',
          title: 'Read',
          start: 540,
          end: 600,
          categoryId: 'work',
          note: 'Chapter two',
        },
      ],
      history: [],
    };
    expect(await coach(input)).toBe('A focused block and a proper break.');
    expect(captured).not.toBeNull();
    const sent = captured as unknown as {
      store: boolean;
      model: string;
      max_output_tokens: number;
      input: { content: string }[];
    };
    expect(sent.store).toBe(false);
    expect(sent.model).toBe('test-model');
    expect(sent.max_output_tokens).toBe(1800);
    expect(sent.input[0].content).toContain('Chapter two');
    expect(sent.input[0].content).toContain('Asia/Tehran');
    expect(sent.input.at(-1)?.content).toBe('Help me plan');
  } finally {
    server.stop(true);
  }
});
