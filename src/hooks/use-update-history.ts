import * as React from 'react';

type Module = 'tax' | 'alta';

interface DialogState {
  open: boolean;
  module?: Module;
  activeSessionId: string | null;
}

type Action =
  | { type: 'open'; module?: Module }
  | { type: 'close' }
  | { type: 'setActiveSession'; sessionId: string | null };

interface State {
  state: DialogState;
  openUpdateHistory: (opts?: { module?: Module }) => void;
  closeUpdateHistory: () => void;
  setActiveSessionId: (sessionId: string | null) => void;
}

const listeners: Array<(state: DialogState) => void> = [];

let memoryState: DialogState = {
  open: false,
  module: undefined,
  activeSessionId: null,
};

function dispatch(action: Action) {
  switch (action.type) {
    case 'open':
      memoryState = {
        open: true,
        module: action.module,
        activeSessionId: null, // 每次打开都重置回列表态
      };
      break;
    case 'close':
      memoryState = { ...memoryState, open: false };
      break;
    case 'setActiveSession':
      memoryState = { ...memoryState, activeSessionId: action.sessionId };
      break;
  }
  listeners.forEach((listener) => listener(memoryState));
}

/**
 * 打开更新历史 dialog
 * @param opts.module - 限定模块，不传则显示全部
 */
export function openUpdateHistory(opts?: { module?: Module }) {
  dispatch({ type: 'open', module: opts?.module });
}

/**
 * 关闭更新历史 dialog
 */
export function closeUpdateHistory() {
  dispatch({ type: 'close' });
}

/**
 * 设置当前查看的 session（用于详情视图切换）
 */
export function setActiveSessionId(sessionId: string | null) {
  dispatch({ type: 'setActiveSession', sessionId });
}

function useUpdateHistory(): State {
  const [state, setState] = React.useState<DialogState>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, []);

  return {
    state,
    openUpdateHistory,
    closeUpdateHistory,
    setActiveSessionId,
  };
}

export { useUpdateHistory };
