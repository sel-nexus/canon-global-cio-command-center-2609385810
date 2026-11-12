/** Isolate failed view or canvas rendering from the surrounding textual shell. */
import { Component } from 'react';
import PropTypes from 'prop-types';

/** Replace only the failing subtree, leaving adjacent context intact. */
export class PanelErrorBoundary extends Component {
  state = { failed: false };

  /** Convert a descendant render failure to an explicit unavailable state. */
  static getDerivedStateFromError() {
    return { failed: true };
  }

  /** Render safe fallback content without logging error or user data. */
  render() {
    if (this.state.failed) {
      return this.props.fallback ?? (
        <p role="alert" className="error">Panel unavailable. Other dashboard views remain available.</p>
      );
    }
    return this.props.children;
  }
}

PanelErrorBoundary.propTypes = {
  children: PropTypes.node,
  fallback: PropTypes.node,
};
