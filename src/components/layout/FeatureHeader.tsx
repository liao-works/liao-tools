import type { ReactNode } from 'react';
interface FeatureHeaderProps {
  eyebrow: string;
  title: string;
  description: string;
  icon?: ReactNode;
  illustrated?: boolean;
  illustrationSrc?: string;
  /** 页头右上角操作区（如「查看教程」入口） */
  action?: ReactNode;
}
export function FeatureHeader({ eyebrow, title, description, icon, illustrated, illustrationSrc, action }: FeatureHeaderProps) {
  return <header className="lt-feature-header">
    <div className="lt-feature-header-copy">
      <span className="lt-kicker">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {action ? <div className="absolute right-3 top-3 z-10">{action}</div> : null}
    {(illustrated || illustrationSrc) ? <img src={illustrationSrc || '/illustrations/trade-hero.svg'} alt="" aria-hidden="true"/> : icon ? <div className="lt-feature-symbol" aria-hidden="true">{icon}</div> : null}
  </header>;
}
