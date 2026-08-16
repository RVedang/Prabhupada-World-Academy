import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  tabName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class TabErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled error in tab:', this.props.tabName, error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center rounded-xl border border-destructive/20 bg-destructive/5 space-y-4 my-6">
          <div className="p-3 rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base font-semibold text-foreground">
              Unable to load {this.props.tabName || 'tab content'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {this.state.error?.message || 'A temporary error occurred while rendering this section.'}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={this.handleRetry} className="gap-2 text-xs">
            <RefreshCw className="w-3.5 h-3.5" />
            Try Loading Again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
