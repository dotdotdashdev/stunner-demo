import { useEffect, useRef, useState } from 'react';

type ExampleSliderProps = {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
};

export const ExampleSlider = ({ id, label, value, min, max, step, onChange }: ExampleSliderProps) => {
  const [draftValue, setDraftValue] = useState<string>(() => String(value));
  const numberInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (document.activeElement !== numberInputRef.current) {
      setDraftValue(String(value));
    }
  }, [value]);

  const commitDraftValue = () => {
    const parsed = Number(draftValue);
    if (Number.isFinite(parsed)) {
      onChange(parsed);
    }
  };

  return (
    <div className="example-control-row">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <input
        ref={numberInputRef}
        type="number"
        min={min}
        max={max}
        step={step}
        value={draftValue}
        onChange={(event) => setDraftValue(event.target.value)}
        onBlur={commitDraftValue}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setDraftValue(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    </div>
  );
};
