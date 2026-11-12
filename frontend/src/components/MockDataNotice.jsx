/** Keep the illustrative-data boundary visible beside dashboard content. */
import PropTypes from 'prop-types';

/** Disclose that this display is neither live nor authoritative.
 * Args:
 *   children: Optional additional caveat, rendered safely as text/content.
 * Returns:
 *   A persistent explanatory note rather than a transient announcement.
 */
export function MockDataNotice({ children }) {
  return (
    <p className="mock-notice">
      Illustrative demo only — not live or verified enterprise data. Not validated advice.
      {children && (
        <span> {children}</span>
      )}
    </p>
  );
}

MockDataNotice.propTypes = {
  children: PropTypes.node,
};
