import * as React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ColoringStudio } from '../coloring/ColoringStudio';
import { coloringPageById } from '../coloring/pages';
import { ModernBackButton } from './ModernBackButton';

export function ModernColoring(): React.ReactElement {
  const { pageId } = useParams();
  if (!pageId) return <Navigate to="/m/resources#coloring" replace />;
  const page = coloringPageById(pageId);
  if (!page) return <Navigate to="/m/resources#coloring" replace />;
  return (
    <section className="modern-page modern-coloring-studio-page">
      <ModernBackButton to="/m/resources#coloring" label="Pages" />
      <p className="modern-eyebrow">COLORING THERAPY</p>
      <h1>{page.title}</h1>
      <ColoringStudio page={page} variant="modern" />
    </section>
  );
}
