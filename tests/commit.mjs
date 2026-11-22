import test from 'node:test';
import assert from 'node:assert/strict';

test('a database write failure returns no success receipt and rolls back the conversation', async () => {
  const url = (process.env.TEST_URL || 'http://localhost:3218') + '/api/desk';
  const create = await fetch(url, {method:'POST', body: JSON.stringify({op:'sample'})});
  assert.equal(create.status, 200);
  const before = await create.json();
  const cookie = create.headers.get('set-cookie').split(';')[0];
  const request = data => fetch(url, {method:'POST',headers:{cookie},body:JSON.stringify(data)});
  // PostgreSQL JSONB rejects a NUL character. The task handler has prepared
  // its receipt by this point, so this exercises the commit boundary.
  const failed = await request({op:'chat',text:'Add a task to test\u0000failure tomorrow'});
  assert.equal(failed.status, 500);
  assert.deepEqual(Object.keys(await failed.json()), ['error']);
  const after = await (await request({op:'load'})).json();
  assert.deepEqual(after.space, before.space);
});
