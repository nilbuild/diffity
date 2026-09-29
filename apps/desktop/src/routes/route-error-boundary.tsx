import { Component, type ReactNode } from 'react';
import { ErrorPage } from '../components/error-page';

interface RouteErrorBoundaryProps {
  resetKey: string;
  actions: (reset: () => void) => Array<{ label: string; primary?: boolean; onClick: () => void }>;
  children: ReactNode;
}

interface RouteErrorBoundaryState {
  error: unknown;
  resetKey: string;
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  static getDerivedStateFromProps(props: RouteErrorBoundaryProps, state: RouteErrorBoundaryState) {
    if (props.resetKey !== state.resetKey) {
      return { error: null, resetKey: props.resetKey };
    }
    return null;
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error === null) {
      return this.props.children;
    }
    return <ErrorPage error={this.state.error} actions={this.props.actions(this.reset)} />;
  }
}
