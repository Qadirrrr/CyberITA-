import { Component } from 'react';

// Last-resort catch for render/runtime errors anywhere in the tree:
// without this, a single component crash unmounts the whole app and
// students see a blank white page. The fallback keeps the session
// recoverable with a reload and shows a support-friendly message.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Keep a trace in the console for support/debugging.
    console.error('Unhandled UI error:', error, info?.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-2xl">
            ⚠️
          </div>
          <h1 className="text-lg font-semibold text-slate-100">Something went wrong</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            The page hit an unexpected error. Your work is saved on the server — reloading usually fixes this.
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            className="mt-6 w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-300"
          >
            Reload page
          </button>
          <a href="/" className="mt-3 block text-sm text-slate-400 underline-offset-2 transition hover:text-slate-200 hover:underline">
            Go to home page
          </a>
        </div>
      </div>
    );
  }
}
