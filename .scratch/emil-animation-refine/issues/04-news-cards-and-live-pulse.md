# 04 — News Cards & Live Data Pulse Indicator

**What to build:**
Refine NewsCard image hover zoom to scale-[1.03], elevate card shadow, and add alert ripple dots to Earthquake & Weather widgets.

**Blocked by:** 01 — Global Tokens & Keyframe Animations.

**Status:** ready-for-agent

- [ ] Update `components/News/NewsCard.tsx` image scale from `group-hover:scale-105` to `group-hover:scale-[1.03]` with 300ms `ease-out-emil`.
- [ ] Optimize `NewsCard.tsx` transitions, replacing `transition-all` with targeted transform/shadow transitions and card elevation.
- [ ] Apply `animate-alert-ripple` pulse dots to `components/Tools/EarthquakeSidebarWidget.tsx` and `components/Tools/WeatherAlertSidebarWidget.tsx`.
- [ ] Add live pulse dot to real-time status badges in `app/tools/earthquakes/EarthquakeContent.tsx`.
