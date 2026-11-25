namespace WeatherApp.Elements;

public class WindowElements
{
    public static string GetMapHtml() => """
        <!doctype html>
        <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <link rel="stylesheet" href="https://planner.example/leaflet.css">
        <script src="https://planner.example/leaflet.js"></script>
        <style>
        *{box-sizing:border-box}body{margin:0;font:14px 'Segoe UI Variable',sans-serif;color:white;background:#18283b}
        #map{height:100vh;background:#26384a}.leaflet-tile-pane{filter:saturate(.45) brightness(.84)}
        aside{position:absolute;z-index:500;top:12px;left:12px;padding:12px;border-radius:16px;background:rgba(20,32,51,.94);box-shadow:0 4px 18px #12223845}
        h1{font-size:17px;font-weight:600;margin:0 0 9px}button{border:0;border-radius:8px;padding:6px 9px;background:#35475e;color:#fff;cursor:pointer}
        button[aria-pressed=true]{background:#d6ebff;color:#182b40}button:focus-visible{outline:3px solid #ffcc68}
        .pin{text-align:center;color:white;font:600 12px 'Segoe UI',sans-serif}.pin b,.pin small{display:table;margin:auto;background:#20344a;border-radius:12px;padding:3px 8px;white-space:nowrap}
        .pin b{font-size:14px;background:#34597a}.pin.active b{outline:2px solid white}.pin small{margin-top:3px}
        #status{font-size:12px;color:#d1deeb;margin:8px 0 0} 
        </style><script src="https://planner.example/geography.js"></script><script src="https://planner.example/basemap.js"></script></head><body><div id="map" aria-label="Map of saved observing locations"></div>
        <aside><h1>Observing map</h1><button id="cloud" aria-pressed="true">Cloud cover</button>
        <button id="temp" aria-pressed="false">Temperature</button> <button id="fit">Fit sites</button>
        <p id="status" role="status">Loading map…</p></aside>
        <script>
        const statusLine=document.querySelector('#status');
        if(!window.L){statusLine.textContent='Map unavailable. Check your connection.';}
        else {
            const map=L.map('map',{zoomControl:false}).setView([25,0],2);
            addBasemap(map);
            L.control.zoom({position:'topright'}).addTo(map);
            const pins=L.layerGroup().addTo(map);
            let cities=[], metric='cloud', lastSite;
            function fit(){
                if(cities.length) map.fitBounds(cities.map(c=>[c.latitude,c.longitude]),{paddingTopLeft:[60,115],paddingBottomRight:[60,45],maxZoom:8});
            }
            function draw(){
                pins.clearLayers();
                for(const city of cities){
                    const cover=city.cloudCover==null?'Unavailable':Math.round(city.cloudCover)+'%';
                    const marker=document.createElement('div');
                    marker.className='pin'+(city.isActive?' active':'');
                    const value=document.createElement('b'), name=document.createElement('small');
                    value.textContent=metric==='cloud'?cover:city.temperature??'Unavailable';
                    name.textContent=city.name;
                    marker.append(value,name);
                    const detail=document.createElement('span');
                    detail.textContent=city.name+' · Cloud cover '+cover+' · Temperature '+(city.temperature??'unavailable');
                    L.marker([city.latitude,city.longitude],{title:detail.textContent,alt:detail.textContent,icon:L.divIcon({className:'',html:marker,iconSize:[100,45],iconAnchor:[50,22]})}).bindPopup(detail).addTo(pins);
                }
                statusLine.textContent=cities.length?(metric==='cloud'?'Lower cloud cover means clearer skies.':'Current temperature at saved sites.'):'Add a city to compare observing sites.';
            }
            window.setTrackedCities=data=>{
                cities=data;
                draw();
                const site=cities.find(c=>c.isActive);
                const key=site&&[site.latitude,site.longitude].join(',');
                if(key!==lastSite && site) map.setView([site.latitude,site.longitude],6);
                lastSite=key;
            };
            for(const id of ['cloud','temp']) document.getElementById(id).onclick=()=>{
                metric=id;
                for(const key of ['cloud','temp']) document.getElementById(key).setAttribute('aria-pressed',key===id);
                draw();
            };
            document.querySelector('#fit').onclick=fit;
            new ResizeObserver(()=>map.invalidateSize()).observe(document.querySelector('#map'));
        }
        </script></body></html>
        """;
}
