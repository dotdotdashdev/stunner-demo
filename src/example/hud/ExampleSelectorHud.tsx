import type { SandboxExample } from '../../stunner/renderer/CanvasStage';

const SANDBOX_EXAMPLES: SandboxExample[] = ['modelsAndMaterials', 'pointLights', 'crowd', 'flocking'];

type ExampleSelectorHudProps = {
  sandboxExample: SandboxExample;
  onSelectExample: (next: SandboxExample) => void;
};

export const ExampleSelectorHud = ({ sandboxExample, onSelectExample }: ExampleSelectorHudProps) => {
  return (
    <aside className="example-hud example-selector-hud" aria-label="Example selector">
      <label htmlFor="sandbox-example">Example</label>
      <select
        id="sandbox-example"
        value={sandboxExample}
        onChange={(event) => onSelectExample(event.target.value as SandboxExample)}
      >
        {SANDBOX_EXAMPLES.map((example) => (
          <option key={example} value={example}>
            {example}
          </option>
        ))}
      </select>
    </aside>
  );
};
