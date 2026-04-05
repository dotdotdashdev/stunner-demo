# Feature Failover Policy

Phase 5.2 adds an automatic quality failover/escalation policy based on performance and overflow signals.

## API

Use `evaluateFailover` from `src/stunner/renderer/quality/FailoverPolicy.ts`:

```ts
import { evaluateFailover } from '../stunner/renderer/quality/FailoverPolicy';

const decision = evaluateFailover({
  currentPreset: 'high',
  avgFrameTimeMs: 19,
  shadowOverflowCount: 2,
  clusterOverflowCount: 0,
  deviceClass: 'desktop',
});
```

## Inputs Considered

- current preset
- average frame time
- shadow atlas overflow count
- cluster overflow count
- device class

## Outputs

- `nextPreset`
- `reason`
- `appliedConfig`

## Notes

- This policy is conservative and one-step-at-a-time.
- It can be called periodically (for example, every few seconds) to avoid oscillation.
