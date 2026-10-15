import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command, Search } from 'lucide-react';
import { findTools } from './navigation';

export function GlobalCommand() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const items = findTools(query);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      } else if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('liao:open-command', onOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('liao:open-command', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function go(href: string) {
    setOpen(false);
    navigate(href);
  }

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[450] flex items-start justify-center bg-foreground/35 px-3 pt-[min(18vh,150px)] backdrop-blur-[2px]"
      onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}
    >
      <div role="dialog" aria-modal="true" aria-label="快速搜索工具" className="w-full max-w-xl overflow-hidden rounded-2xl border border-border bg-popover shadow-lg">
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="search"
            aria-label="输入工具名称或关键词"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelected(0); }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setSelected((index) => Math.min(index + 1, items.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setSelected((index) => Math.max(0, index - 1));
              } else if (event.key === 'Enter' && items[selected]) {
                event.preventDefault();
                go(items[selected].href);
              }
            }}
            placeholder="搜索工具，例如关税、Amazon、DPD..."
            className="h-14 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="rounded border border-border px-2 py-1 text-xs text-muted-foreground">Esc</kbd>
        </div>
        <div className="max-h-[min(50vh,420px)] overflow-y-auto p-2" role="listbox" aria-label="搜索结果">
          {items.length ? items.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.href}
                type="button"
                role="option"
                aria-selected={selected === index}
                onMouseEnter={() => setSelected(index)}
                onClick={() => go(item.href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition-colors ${selected === index ? 'bg-primary-subtle text-foreground-emphasis' : 'text-foreground hover:bg-accent'}`}
              >
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                <span className="flex-1">
                  <span className="block text-sm font-medium">{item.title}</span>
                  <span className="block text-xs text-muted-foreground">{item.description}</span>
                </span>
                {selected === index && <span className="text-xs text-muted-foreground">↵</span>}
              </button>
            );
          }) : (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">没有找到对应工具，请换个关键词。</p>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <span>↑ ↓ 选择 · Enter 打开 · Esc 关闭</span>
          <span className="inline-flex items-center gap-1"><Command className="h-3 w-3" /> Liao Tools</span>
        </div>
      </div>
    </div>
  );
}
