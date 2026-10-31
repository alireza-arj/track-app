import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { MotionProvider } from './motion';
import './styles.css';
class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="boot-error">
        <h1>Your journal is still here.</h1>
        <p>
          Daylog could not open this view. Reload to try again. If the problem continues, keep this
          browser’s site data so your journal can be recovered.
        </p>
        <button className="primary" onClick={() => location.reload()}>
          Reload Daylog
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Boundary>
      <MotionProvider>
        <App />
      </MotionProvider>
    </Boundary>
  </React.StrictMode>,
);
