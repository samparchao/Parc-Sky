function addBasemap(map){
  map.setMaxZoom(9);
  L.geoJSON(countries,{smoothFactor:1.4,style:{color:'#708e91',weight:0.7,fillColor:'#496668',fillOpacity:1},interactive:false}).addTo(map);
  map.attributionControl?.addAttribution('Natural Earth');
}
