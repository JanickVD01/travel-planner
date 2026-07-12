/* Sample itineraries for the 0015 map prototype. Mirrors the real data model:
 * STAYS carry lat/lng; TRAVEL legs don't. `status`/`dur`/`photo` feed the authentic
 * timeline card (chip, duration pill, pinned photo). Coords are plain numbers. */
window.TRIPS = {
  thailand: {
    title: "Thailand", range: "3–16 Nov",
    steps: [
      { kind: "travel", title: "Fly Brussels → Bangkok", mode: "flight", dates: "3 Nov · dep 10:05 → arr 06:20", dur: "11h 15m", status: "Confirmed" },
      { kind: "stay", title: "Bangkok", lat: 13.7590, lng: 100.4940, dates: "3 Nov → 7 Nov", dur: "4 nights", status: "Booked", photo: "assets/sample-stay.jpg" },
      { kind: "travel", title: "Overnight train → Chiang Mai", mode: "rail", dates: "7 Nov · dep 18:40 → arr 07:15", dur: "12h 35m", status: "Booked" },
      { kind: "stay", title: "Chiang Mai", lat: 18.7877, lng: 98.9931, dates: "8 Nov → 12 Nov", dur: "4 nights", status: "Booked" },
      { kind: "travel", title: "Fly Chiang Mai → Krabi", mode: "flight", dates: "12 Nov · dep 11:20 → arr 13:15", dur: "1h 55m", status: "Planned" },
      { kind: "stay", title: "Ko Lanta", lat: 7.6122, lng: 99.0405, dates: "12 Nov → 16 Nov", dur: "4 nights", status: "Idea" }
    ]
  },
  world: {
    title: "Grand Tour", range: "Nov – Dec",
    steps: [
      { kind: "stay", title: "Brussels", lat: 50.8503, lng: 4.3517, dates: "start · 2 nights", dur: "2 nights", status: "Confirmed" },
      { kind: "travel", title: "Fly Brussels → Bangkok", mode: "flight", dates: "dep 10:05 → arr 06:20", dur: "11h 15m", status: "Confirmed" },
      { kind: "stay", title: "Bangkok", lat: 13.7590, lng: 100.4940, dates: "5 nights", dur: "5 nights", status: "Booked", photo: "assets/sample-stay.jpg" },
      { kind: "travel", title: "Fly Bangkok → Tokyo", mode: "flight", dates: "dep 22:30 → arr 06:45", dur: "5h 40m", status: "Booked" },
      { kind: "stay", title: "Tokyo", lat: 35.6762, lng: 139.6503, dates: "6 nights", dur: "6 nights", status: "Planned" },
      { kind: "travel", title: "Fly Tokyo → San Francisco", mode: "flight", dates: "dep 17:00 → arr 09:30", dur: "9h 30m", status: "Planned" },
      { kind: "stay", title: "San Francisco", lat: 37.7749, lng: -122.4194, dates: "4 nights", dur: "4 nights", status: "Idea" }
    ]
  }
};
