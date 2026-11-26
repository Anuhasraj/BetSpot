import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

/**
 * Top-level React ErrorBoundary preventing a blank screen if WebGL or a UI view throws.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  public static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unexpected interface error.',
    };
  }

  public override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#120604] p-6 text-amber-50">
          <div className="w-full max-w-md rounded-2xl border-2 border-amber-500/40 bg-[#230C08] p-6 text-center space-y-4 shadow-2xl">
            <h2 className="font-display text-lg font-bold text-amber-200">
              Something went wrong
            </h2>
            <p className="text-xs text-amber-200/75 leading-relaxed">
              {this.state.message || 'The arena encountered an unexpected display error.'}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border-b-4 border-emerald-800 bg-gradient-to-b from-emerald-400 to-emerald-600 px-5 py-2.5 text-xs font-extrabold text-slate-950 hover:from-emerald-300 hover:to-emerald-500 cursor-pointer"
            >
              Reload BetSpot
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
