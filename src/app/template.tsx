// A template (unlike layout) remounts on every navigation, so this wrapper replays its
// entrance animation on each route change — giving a smooth page-to-page transition.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-transition">{children}</div>;
}
