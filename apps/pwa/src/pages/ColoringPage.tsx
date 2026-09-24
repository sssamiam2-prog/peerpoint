import * as React from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ColoringGallery } from '../coloring/ColoringGallery';
import { ColoringStudio } from '../coloring/ColoringStudio';
import { coloringPageById } from '../coloring/pages';

export function ColoringPage(): React.ReactElement {
  const { pageId } = useParams();
  if (pageId) {
    const page = coloringPageById(pageId);
    if (!page) return <Navigate to="/coloring" replace />;
    return (
      <div className="page-shell-wide coloring-classic">
        <p className="lede">
          <Link to="/coloring">← Coloring pages</Link>
        </p>
        <h2>{page.title}</h2>
        <ColoringStudio page={page} variant="classic" />
      </div>
    );
  }

  return (
    <div className="page-shell-wide coloring-classic">
      <h2>Coloring Therapy</h2>
      <ColoringGallery variant="classic" colorPath={id => `/coloring/${id}`} />
    </div>
  );
}
