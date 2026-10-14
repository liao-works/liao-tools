import type { ReactNode } from 'react';
interface FeatureHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  icon?: ReactNode;
  illustrated?: boolean;
}
export function FeatureHeader({ eyebrow, title, description, icon, illustrated }: FeatureHeaderProps) {
  return <header className="lt-feature-header">
    <div className="lt-feature-header-copy">
      <span className="lt-kicker">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {illustrated ? <img src="/illustrations/trade-scene.svg" alt="" aria-hidden="true"/> : icon ? <div className="lt-feature-symbol" aria-hidden="true">{icon}</div> : null}
  </header>;
}
