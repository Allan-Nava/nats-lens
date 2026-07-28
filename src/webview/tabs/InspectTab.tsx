import * as React from 'react';
import { renderPayload, toBase64, toHex } from '../../core/payload';
import { validateJson, JsonSchema } from '../../core/schema';
import { Button, Label, Textarea } from '../components/ui/controls';
import { Card, CardTitle } from '../components/ui/card';

export function InspectTab() {
  const [payload, setPayload] = React.useState('');
  const [schema, setSchema] = React.useState('');
  const [output, setOutput] = React.useState('');

  const bytes = () => new TextEncoder().encode(payload);

  const pretty = () => {
    const { text } = renderPayload(bytes());
    setOutput(text);
  };
  const validate = () => {
    let value: unknown;
    let sch: JsonSchema;
    try {
      value = JSON.parse(payload);
    } catch {
      setOutput('✗ payload is not valid JSON');
      return;
    }
    try {
      sch = JSON.parse(schema) as JsonSchema;
    } catch {
      setOutput('✗ schema is not valid JSON');
      return;
    }
    const errors = validateJson(value, sch);
    setOutput(errors.length ? errors.map((e) => `${e.path}: ${e.message}`).join('\n') : '✓ valid against schema');
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label>Payload</Label>
        <Textarea rows={6} value={payload} onChange={(e) => setPayload(e.target.value)} placeholder='{"id": 1}' />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={pretty}>
          Pretty JSON / text
        </Button>
        <Button variant="ghost" onClick={() => setOutput(toBase64(bytes()))}>
          base64
        </Button>
        <Button variant="ghost" onClick={() => setOutput(toHex(bytes()))}>
          hex
        </Button>
      </div>
      <div>
        <Label>JSON Schema (per validazione)</Label>
        <Textarea
          rows={4}
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
          placeholder='{"type":"object","required":["id"]}'
        />
        <div className="mt-2">
          <Button onClick={validate} disabled={!schema.trim()}>
            Validate
          </Button>
        </div>
      </div>
      {output && (
        <Card>
          <CardTitle>Output</CardTitle>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap text-sm">{output}</pre>
        </Card>
      )}
    </div>
  );
}
