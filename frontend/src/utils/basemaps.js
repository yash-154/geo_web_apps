import OSM from 'ol/source/OSM';
import XYZ from 'ol/source/XYZ';

export const createBasemapSource = (basemapId) => {
  if (basemapId === 'dark') {
    return new XYZ({
      url: 'https://{a-d}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      attributions: '&copy; OpenStreetMap contributors &copy; CARTO',
      crossOrigin: 'anonymous',
    });
  }

  if (basemapId === 'gray') {
    return new XYZ({
      url: 'https://{a-d}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      attributions: '&copy; OpenStreetMap contributors &copy; CARTO',
      crossOrigin: 'anonymous',
    });
  }

  if (basemapId === 'elevation') {
    return new XYZ({
      url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      attributions: '&copy; OpenTopoMap contributors &copy; OpenStreetMap contributors',
      crossOrigin: 'anonymous',
      maxZoom: 17,
    });
  }

  if (basemapId === 'terrain') {
    return new XYZ({
      url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
      attributions: '&copy; OpenTopoMap contributors &copy; OpenStreetMap contributors',
      crossOrigin: 'anonymous',
      maxZoom: 17,
    });
  }

  if (basemapId === 'satellite') {
    return new XYZ({
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attributions: 'Tiles &copy; Esri',
      crossOrigin: 'anonymous',
    });
  }

  return new OSM();
};

export default createBasemapSource;
