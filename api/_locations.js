const DEFAULT_EMAIL = "info@cubicship.com";

function clean(value) {
  return String(value || "").trim();
}

const LOCATIONS = [
  {
    id: "bridgeview",
    name: "Cubic Ship Bridgeview",
    address: "7327 W 87th Street, Bridgeview, IL 60455",
    emailEnv: "LOCATION_EMAIL_BRIDGEVIEW",
    branchEmail: "bridgeview@cubicship.com",
    city: "Bridgeview",
    state: "IL",
    latitude: 41.7349,
    longitude: -87.8066,
    geofenceMeters: 250,
  },
  {
    id: "dearborn",
    name: "Dearborn, MI",
    address: "6317 Schaefer Rd, Dearborn, MI 48126",
    emailEnv: "LOCATION_EMAIL_DEARBORN",
    branchEmail: "dearborn@cubicship.com",
    city: "Dearborn",
    state: "MI",
  },
  {
    id: "oak-park",
    name: "Oak Park / West Chicago, IL",
    address: "6200 Roosevelt Rd, Oak Park, IL 60304",
    emailEnv: "LOCATION_EMAIL_OAK_PARK",
    branchEmail: "oakpark@cubicship.com",
    city: "Oak Park",
    state: "IL",
  },
  {
    id: "oak-lawn",
    name: "Oak Lawn, IL",
    address: "9812 S Cicero Ave, Oak Lawn, IL 60453",
    emailEnv: "LOCATION_EMAIL_OAK_LAWN",
    branchEmail: "oaklawn@cubicship.com",
    city: "Oak Lawn",
    state: "IL",
  },
  {
    id: "mccook",
    name: "McCook Area",
    address: "McCook / Chicago regional service area",
    emailEnv: "LOCATION_EMAIL_MCCOOK",
    branchEmail: "mccook@cubicship.com",
    city: "McCook",
    state: "IL",
  },
  {
    id: "buffalo",
    name: "Buffalo, NY",
    address: "2618 Main St, Buffalo, NY 14214",
    emailEnv: "LOCATION_EMAIL_BUFFALO",
    branchEmail: "buffalo@cubicship.com",
    city: "Buffalo",
    state: "NY",
  },
  {
    id: "bethpage",
    name: "Bethpage, NY",
    address: "271 Broadway, Bethpage, NY 11714",
    emailEnv: "LOCATION_EMAIL_BETHPAGE",
    branchEmail: "bethpage@cubicship.com",
    city: "Bethpage",
    state: "NY",
  },
  {
    id: "iselin",
    name: "Iselin / Woodbridge, NJ",
    address: "1214 Green St, Iselin, NJ 08830",
    emailEnv: "LOCATION_EMAIL_ISELIN",
    branchEmail: "iselin@cubicship.com",
    city: "Iselin",
    state: "NJ",
  },
  {
    id: "milwaukee",
    name: "Milwaukee, WI",
    address: "2609 W Morgan Ave, Milwaukee, WI 53221",
    emailEnv: "LOCATION_EMAIL_MILWAUKEE",
    branchEmail: "milwaukee@cubicship.com",
    city: "Milwaukee",
    state: "WI",
  },
  {
    id: "wyncote",
    name: "Wyncote, PA",
    address: "1000 S Easton Rd Ste 270, Wyncote, PA 19095",
    emailEnv: "LOCATION_EMAIL_WYNCOTE",
    branchEmail: "wyncote@cubicship.com",
    city: "Wyncote",
    state: "PA",
  },
  {
    id: "indianapolis",
    name: "Indianapolis, IN",
    address: "3853 Georgetown Rd, Indianapolis, IN 46254",
    emailEnv: "LOCATION_EMAIL_INDIANAPOLIS",
    branchEmail: "indianapolis@cubicship.com",
    city: "Indianapolis",
    state: "IN",
  },
  {
    id: "allentown-pa",
    name: "Allentown, PA",
    address: "717 Linden St, Allentown, PA 18101",
    emailEnv: "LOCATION_EMAIL_ALLENTOWN_PA",
    branchEmail: "allentown@cubicship.com",
    city: "Allentown",
    state: "PA",
  },
  {
    id: "farmington",
    name: "Farmington, MI",
    address: "31826 Grand River Ave, Farmington, MI 48336",
    emailEnv: "LOCATION_EMAIL_FARMINGTON",
    branchEmail: "farmington@cubicship.com",
    city: "Farmington",
    state: "MI",
  },
  {
    id: "northeast-philadelphia",
    name: "Northeast Philadelphia, PA",
    address: "1900 Grant Ave Ste J, Philadelphia, PA 19115",
    emailEnv: "LOCATION_EMAIL_NORTHEAST_PHILADELPHIA",
    branchEmail: "northeastphiladelphia@cubicship.com",
    city: "Northeast Philadelphia",
    state: "PA",
  },
  {
    id: "freeport",
    name: "Freeport, NY",
    address: "134 W Sunrise Hwy, Freeport, NY 11520",
    emailEnv: "LOCATION_EMAIL_FREEPORT",
    branchEmail: "freeport@cubicship.com",
    city: "Freeport",
    state: "NY",
    status: "opening_soon",
  },
  {
    id: "cleveland",
    name: "Cleveland, OH",
    address: "11512 Clifton Blvd, Cleveland, OH 44107",
    emailEnv: "LOCATION_EMAIL_CLEVELAND",
    branchEmail: "cleveland@cubicship.com",
    city: "Cleveland",
    state: "OH",
    status: "opening_soon",
  },
];

function locationEmail(location) {
  return clean(process.env[location.emailEnv]) || clean(location.branchEmail) || clean(process.env.LOCATION_NOTIFICATION_EMAIL) || clean(process.env.QUOTE_REPLY_TO) || DEFAULT_EMAIL;
}

function publicLocation(location) {
  return {
    id: location.id,
    name: location.name,
    address: location.address,
    email: locationEmail(location),
    branchEmail: clean(location.branchEmail) || locationEmail(location),
    city: location.city || "",
    state: location.state || "",
    status: location.status || "active",
    latitude: location.latitude || null,
    longitude: location.longitude || null,
    geofenceMeters: location.geofenceMeters || 250,
  };
}

function findLocation(id) {
  const normalized = clean(id) || "bridgeview";
  return publicLocation(LOCATIONS.find((location) => location.id === normalized) || LOCATIONS[0]);
}

module.exports = {
  LOCATIONS,
  findLocation,
  publicLocation,
};
