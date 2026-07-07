import { useState } from 'react';
import type { SandboxExample } from '../../components/CanvasStage';

const SANDBOX_EXAMPLES: SandboxExample[] = [
  'brainStemDraco',
  'city',
  'crowd',
  'flocking',
  'hills',
  'modelsAndMaterials',
  'pointLights',
  'porsche',
  'vehicle',
  'sponza',
  'train',
];

type ExampleSelectorHudProps = {
  sandboxExample: SandboxExample;
  onSelectExample: (next: SandboxExample) => void;
};

export const ExampleSelectorHud = ({ sandboxExample, onSelectExample }: ExampleSelectorHudProps) => {
  const [helpOpen, setHelpOpen] = useState(false);
  return (
    <aside
      className={`example-hud example-selector-hud${helpOpen ? ' example-selector-hud--help-open' : ''}`}
      aria-label="Example selector"
    >
      <label htmlFor="sandbox-example">Example</label>
      <select
        id="sandbox-example"
        name="sandbox-example"
        value={sandboxExample}
        onChange={(event) => onSelectExample(event.target.value as SandboxExample)}
      >
        {SANDBOX_EXAMPLES.map((example) => (
          <option key={example} value={example}>
            {example}
          </option>
        ))}
      </select>
      <div className="example-selector-footer">
        <small>Shift + H to toggle HUD</small>
        <button
          type="button"
          className="example-selector-help-button"
          aria-expanded={helpOpen}
          aria-label={helpOpen ? 'Hide controls reference' : 'Show controls reference'}
          title={helpOpen ? 'Hide controls' : 'Show controls'}
          onClick={() => setHelpOpen((open) => !open)}
        >
          {helpOpen ? '\u00d7' : '?'}
        </button>
      </div>
      {helpOpen ? (
        <div className="example-selector-help" role="region" aria-label="Controls reference">
          <section>
            <h4>Keyboard controls</h4>
            <ul>
              <li><kbd>W</kbd>/<kbd>A</kbd>/<kbd>S</kbd>/<kbd>D</kbd> — Move</li>
              <li><b>Arrow keys</b> — Look around</li>
              <li><kbd>Space</kbd> — Up</li>
              <li><kbd>Ctrl</kbd> + <kbd>Space</kbd> — Down</li>
              <li><kbd>Shift</kbd> + any control — 10% speed</li>
            </ul>
          </section>
          <section>
            <h4>Mouse controls</h4>
            <ul>
              <li><b>Primary drag</b> — Look around</li>
              <li><b>Secondary drag</b> — Pan</li>
              <li><b>Wheel</b> — Move in and out</li>
              <li><kbd>Ctrl</kbd> + <b>Wheel</b> — Field of view</li>
            </ul>
          </section>
          <section>
            <h4>Touch controls</h4>
            <ul>
              <li><b>Pan</b> — Look around</li>
              <li><b>Two-finger pan</b> — Pan</li>
              <li><b>Pinch / zoom</b> — Move in and out</li>
            </ul>
          </section>
        </div>
      ) : null}
    </aside>
  );
};

