import { Component, useEffect, useState, type ReactNode } from 'react';
import { CourseNavigationProvider } from '@buildment/learning-ui/components/learn/course-navigation';
import { MascotPlayer } from '@buildment/learning-ui/mascot/MascotPlayer';
import { useMascotReactions } from './mascot';

/** A mascot that fails to draw disappears; the lesson around it carries on. */
class MascotBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.warn('[mascot] player failed', error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** The shared player. A link from a reaction goes to `onOpenLink`, which owns desktop navigation. */
export function DesktopMascot({
  onOpenLink,
}: {
  onOpenLink: (href: string) => void;
}) {
  const [assetOrigin, setAssetOrigin] = useState<string>();
  useEffect(() => {
    // Only a voice clip without a full URL needs this, so failing to get it costs nothing else.
    void Promise.resolve()
      .then(() => window.buildment.webOrigin())
      .then(setAssetOrigin)
      .catch(() => undefined);
  }, []);
  return (
    <MascotBoundary>
      <CourseNavigationProvider onNavigate={onOpenLink}>
        <MascotPlayer
          useReactions={useMascotReactions}
          assetOrigin={assetOrigin}
        />
      </CourseNavigationProvider>
    </MascotBoundary>
  );
}
