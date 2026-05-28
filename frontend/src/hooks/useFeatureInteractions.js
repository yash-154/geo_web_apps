import { useCallback } from 'react';

export default function useFeatureInteractions(context) {
  const {
    mapRef,
    popupOverlayRef,
    popupDragOffsetRef,
    popupDraggingRef,
    highlightLayerRef,
    hoverHighlightLayerRef,
    setFeatureInfo,
  } = context;

  const closePopup = useCallback(() => {
    setFeatureInfo(null);
    popupOverlayRef.current?.setPosition(undefined);
    highlightLayerRef.current?.getSource().clear();
  }, [highlightLayerRef, popupOverlayRef, setFeatureInfo]);

  const onPopupMouseDown = useCallback((event) => {
    if (!mapRef.current || !popupOverlayRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const position = popupOverlayRef.current.getPosition();
    if (!position) return;
    const map = mapRef.current;
    const pixel = map.getPixelFromCoordinate(position);
    popupDragOffsetRef.current = [event.clientX - pixel[0], event.clientY - pixel[1]];
    popupDraggingRef.current = true;
  }, [mapRef, popupDragOffsetRef, popupDraggingRef, popupOverlayRef]);

  const clearHoverHighlight = useCallback(() => {
    hoverHighlightLayerRef.current?.getSource().clear();
  }, [hoverHighlightLayerRef]);

  const highlightHoverFeature = useCallback((feature) => {
    if (!feature) return;
    const source = hoverHighlightLayerRef.current?.getSource();
    if (!source) return;
    source.clear();
    source.addFeature(feature.clone());
  }, [hoverHighlightLayerRef]);

  const zoomToFeature = useCallback((feature) => {
    if (!feature || !mapRef.current) return;
    const geometry = feature.getGeometry();
    if (!geometry) return;

    const view = mapRef.current.getView();
    const geometryType = geometry.getType();
    const extent = geometry.getExtent();

    if (geometryType === 'Point') {
      const coords = geometry.getCoordinates();
      view.animate({ center: coords, zoom: Math.max(view.getZoom(), 20), duration: 400 });
      popupOverlayRef.current?.setPosition(coords);
    } else {
      view.fit(extent, { padding: [20, 20, 20, 20], maxZoom: 18, duration: 400 });
      const center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
      popupOverlayRef.current?.setPosition(center);
    }

    highlightLayerRef.current?.getSource().clear();
    highlightLayerRef.current?.getSource().addFeature(feature.clone());
    setFeatureInfo(feature.getProperties());
  }, [highlightLayerRef, mapRef, popupOverlayRef, setFeatureInfo]);

  return {
    closePopup,
    onPopupMouseDown,
    clearHoverHighlight,
    highlightHoverFeature,
    zoomToFeature,
  };
}
