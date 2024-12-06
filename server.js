const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const flash = require('connect-flash');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Doctor = require('./models/Doctor');
const Blog = require('./models/Blog');
const Patient = require('./models/Patient');
const Leads=require('./models/Leads');
const Subscriptions = require('./models/Subscriptions'); 
const ContactUs = require('./models/ContactUs');
const compression = require('compression');
const cors = require('cors');

dotenv.config();

const app = express();

require('./cronJobs'); 
require('./slotsDelete');

app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(compression({ threshold: 0 }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(cors({
  origin: 'http://localhost:3000', 
  methods: 'GET,POST,PUT,DELETE',
  allowedHeaders: 'Content-Type,Authorization',
  credentials: true 

}));

// app.use(cors({
//   origin: (origin, callback) => {
//     const allowedOrigins = ['http://localhost:3000']; // List of allowed origins
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, origin);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
// }));

// // Manually set headers for additional flexibility
// app.use((req, res, next) => {
//   const origin = req.headers.origin;
//   if (origin && ['http://localhost:3000'].includes(origin)) {
//     res.header('Access-Control-Allow-Origin', origin);
//     res.header('Access-Control-Allow-Credentials', 'true');
//     res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
//     res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
//   }
//   next();
// });

mongoose.connect(process.env.MONGODB_URI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 50000, 
  socketTimeoutMS: 45000 
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: 'sessions',
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 180 * 60 * 1000,
   } 
}));

app.use(flash());
app.use(passport.initialize());
app.use(passport.session());

// Utility for error handling
// const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  Doctor.findById(id, (err, user) => {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await Doctor.findOne({ googleId: profile.id });

      if (!user) {
        user = new Doctor({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          role: null, 
        });
        await user.save();
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

app.use('/auth', require('./routes/auth'));
app.use('/patient', require('./routes/patient'));
app.use('/doctor', require('./routes/doctor'));
app.use('/admin', require('./routes/admin'));
app.use('/supplier', require('./routes/supplier'));
app.use('/corporate', require('./routes/corporate'));


function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/login');
}
app.get('/protected', isLoggedIn, (req, res) => {
  res.send('This is a protected route');
});

app.get('/', (req, res) => {
  const user = req.user;
  res.render('index', { user });
});

app.get('/', (req, res) => {
  const user = req.user;
  const patient = req.patient; // if applicable
  const doctor = req.doctor; // if applicable
  res.render('index', { user, patient, doctor });
});


app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
});
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).send('Something broke!');
});

app.get('/auth/search-doctors', async (req, res) => {
  const { what, where, country, state, city, speciality, conditions, languages, gender, availability, dateAvailability, consultation } = req.query;

  try {
    let matchQuery = {
      role: 'doctor',
      verified: 'Verified',
      'timeSlots.status': 'free'
    };

    let projectFields = {
      _id: 1,
      name: 1,
      speciality: 1,
      rating: 1,
      availability: 1,
      city: '$timeSlots.hospitalLocation.city', 
      state: '$timeSlots.hospitalLocation.state', 
      country: '$timeSlots.hospitalLocation.country', 
      hospitals: '$timeSlots.hospital'
    };

    if (country) matchQuery['timeSlots.hospitalLocation.country'] = { $regex: new RegExp(country, 'i') };
    if (state) matchQuery['timeSlots.hospitalLocation.state'] = { $regex: new RegExp(state, 'i') };
    if (city) matchQuery['timeSlots.hospitalLocation.city'] = { $regex: new RegExp(city, 'i') };
    if (speciality) matchQuery.speciality = { $in: [new RegExp(speciality, 'i')] };
    if (languages) matchQuery.languages = { $in: [new RegExp(languages, 'i')] };
    if (gender) matchQuery.gender = gender;
    if (availability) matchQuery.availability = availability === 'true';
    if (consultation) matchQuery.consultation = consultation;

    if (conditions) {
      const conditionsArray = conditions.split(',').map(cond => new RegExp(cond.trim(), 'i'));
      matchQuery.conditions = { $in: conditionsArray };
    }

    if (what) {
      matchQuery.$or = [
        { speciality: { $regex: new RegExp(what, 'i') } },
        { name: { $regex: new RegExp(what, 'i') } },
        { conditions: { $regex: new RegExp(what, 'i') } }
      ];
    }

    if (where) {
      matchQuery.$or = [
        { 'timeSlots.hospitalLocation.city': { $regex: new RegExp(where, 'i') } },
        { 'timeSlots.hospitalLocation.state': { $regex: new RegExp(where, 'i') } },
        { 'timeSlots.hospitalLocation.country': { $regex: new RegExp(where, 'i') } }
      ];
    }

    if (dateAvailability) {
      const searchDate = new Date(dateAvailability);
      matchQuery['timeSlots.date'] = searchDate;
    }

    const pipeline = [
      { $match: matchQuery },
      { $project: projectFields }
    ];

    const doctors = await Doctor.aggregate(pipeline);

    if (doctors.length === 0) {
      return res.status(200).json({ message: 'No doctors found.' });
    }

    const doctorIds = doctors.map(doctor => doctor._id);
    
    try {
      const fullDoctorDetails = await Doctor.find({ _id: { $in: doctorIds } });
  
      if (fullDoctorDetails && fullDoctorDetails.length > 0) {
        res.json(fullDoctorDetails); 
      } else {
        res.status(404).json({ message: 'Doctors not found' });
      }
    } catch (error) {
      console.error('Error retrieving doctor details:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching doctors', error });
  }
});



app.get('/auth/countries', async (req, res) => {
  try {
    const countries = await Doctor.aggregate([
      { $match: { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' } },
      { $unwind: '$timeSlots' }, // Unwind timeSlots to access individual records
      { $group: { _id: '$timeSlots.hospitalLocation.country' } }, // Group by country to remove duplicates
      { $sort: { _id: 1 } }, // Optional: Sort countries alphabetically
      { $project: { _id: 0, country: '$_id' } } // Project the country field
    ]);

    // Convert the results to an array of country names
    const countryList = countries.map(country => country.country);
    
    res.json(countryList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching countries', error });
  }
});


app.get('/auth/states', async (req, res) => {
  try {
    const states = await Doctor.aggregate([
      { $match: { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' } },
      { $unwind: '$timeSlots' },
      { $match: {'timeSlots.status': 'free'} },
      { $group: { _id:  '$timeSlots.hospitalLocation.state' } },
      { $sort: { _id: 1}},
      { $project: { _id: 0, state: '$_id' } }
    ]);
    const stateList = states.map(state => state.state);
    res.json(stateList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching states', error });
  }
});


app.get('/auth/cities', async (req, res) => {
  try {
    const cities = await Doctor.aggregate([
      { $match: { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' } },
      { $unwind: '$timeSlots' }, // Unwind the timeSlots array to work with individual documents
      { $match: { 'timeSlots.status': 'free' } }, // Match only documents with free time slots
      { $group: { _id: '$timeSlots.hospitalLocation.city' } }, // Group by city to remove duplicates
      { $sort: { _id: 1 } }, // Optionally sort by city name
      { $project: { _id: 0, city: '$_id' } } // Project the city field
    ]);

    // Convert the results to an array of city names
    const cityList = cities.map(city => city.city);
    console.log(cityList);
    
    res.json(cityList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching cities', error });
  }
});

app.get('/auth/hospitals', async (req, res) => {
  try {
    const hospitals = await Doctor.aggregate([
      { $match: { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' } },
      { $unwind: '$timeSlots' },
      { $group: { _id: '$timeSlots.hospital' } },
      { $project: { _id: 0, hospital: '$_id' } }
    ]);
    const hospitalList = hospitals.map(hospital => hospital.hospital);
    res.json(hospitalList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching hospitals', error });
  }
});


app.get('/auth/languages', async (req, res) => {
  try {
    const languages = await Doctor.distinct('languages');
    res.json(languages);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching languages', error });
  }
});

app.get('/auth/specialities', async (req, res) => {
  try {
    const specialities = await Doctor.distinct('speciality');
    res.json(specialities);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching specialities', error });
  }
});

app.get('/auth/conditions', async (req, res) => {
  try {
      const conditions = await Doctor.distinct('conditions');
      res.json(conditions);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching conditions', error });
  }
});


app.get('/auth/what-options', async (req, res) => {
  try {
    const searchQuery = req.query.search || '';  

    let specialities = await Doctor.distinct('speciality');

    if (searchQuery) {
      const queryRegex = new RegExp(searchQuery, 'i');
      specialities = specialities.filter(speciality => queryRegex.test(speciality));
    }

    let conditions = [];
    let doctors = [];
    if (searchQuery) {
      const conditionRegex = new RegExp(searchQuery, 'i');
      conditions = await Doctor.distinct('conditions', { conditions: conditionRegex });
      doctors = await Doctor.find({ name: conditionRegex }, 'name').lean();
    }

    res.json({
      specialities,  
      conditions,   
      doctors      
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching what options', error });
  }
});



app.get('/auth/where-options', async (req, res) => {
  try {
    const citiesFromTimeSlots = await Doctor.distinct('timeSlots.hospitalLocation.city');
    const statesFromTimeSlots = await Doctor.distinct('timeSlots.hospitalLocation.state');
    const countriesFromTimeSlots = await Doctor.distinct('timeSlots.hospitalLocation.country');

    const citiesFromHospitals = await Doctor.distinct('hospitals.city');
    const statesFromHospitals = await Doctor.distinct('hospitals.state');
    const countriesFromHospitals = await Doctor.distinct('hospitals.country');

    const cities = [...new Set([...citiesFromTimeSlots, ...citiesFromHospitals])];
    const states = [...new Set([...statesFromTimeSlots, ...statesFromHospitals])];
    const countries = [...new Set([...countriesFromTimeSlots, ...countriesFromHospitals])];

    res.json({
      cities,
      states,
      countries
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching where options', error });
  }
});

app.post('/submit-email', async (req, res) => {
  const { email } = req.body;

  try {

    const existingSubscription = await Subscriptions.findOne({ email });
    
    if (existingSubscription) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const subscription = new Subscriptions({ email });
    await subscription.save();
    
    res.status(200).json({ message: 'Details saved successfully' });
  } catch (error) {
    console.error('Error saving lead:', error);
    res.status(500).json({ message: 'Error saving lead', error: error.message });
  }
});


app.post('/submit-lead', async (req, res) => {
  const { name, email } = req.body;
  try {

    const existingLead = await Leads.findOne({ email });

    if (existingLead) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const lead = new Leads({ name, email });
    await lead.save();
    res.status(200).json({ message: 'Details saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error saving lead', error });
  }
});


app.post('/contact-us', async (req, res) => {
  const { firstName, lastName, email, phoneNumber, message } = req.body;
  try {
    const contact = new ContactUs({ firstName, lastName, email, phoneNumber, message });
    await contact.save();
    res.status(200).json({ message: 'Contact details saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error saving contact details', error });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));