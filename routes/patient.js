const express = require('express');
const router = express.Router();
const multer = require('multer');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Booking = require('../models/Booking');
const Admin = require('../models/Admin'); 
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Blog = require('../models/Blog');
const Chat = require('../models/Chat');
const Prescription = require('../models/Prescription');
const Notification = require('../models/Notification');
const Insurance = require('../models/Insurance');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const nodemailer = require('nodemailer');
const https = require('https');

const fetchConversionRates = () => {
  return new Promise((resolve, reject) => {
      const options = {
          method: 'GET',
          hostname: 'currency-conversion-and-exchange-rates.p.rapidapi.com',
          path: '/latest?from=USD&to=INR,GBP,AED',
          headers: {
              'x-rapidapi-key': '96f2128666msh6c2a99315734957p152189jsn585b9f07df21', // Add your RapidAPI key here
              'x-rapidapi-host': 'currency-conversion-and-exchange-rates.p.rapidapi.com'
          }
      };

      const req = https.request(options, (res) => {
          let chunks = [];

          res.on('data', (chunk) => {
              chunks.push(chunk);
          });

          res.on('end', () => {
              const body = Buffer.concat(chunks);
              try {
                  const data = JSON.parse(body.toString());

                  // Log the API response to check what data is returned
                  console.log('API response:', data);

                  // Check if rates exist and resolve only valid rates
                  if (data && data.rates) {
                      resolve(data.rates);
                  } else {
                      reject(new Error('Invalid API response or missing rates'));
                  }
              } catch (err) {
                  reject(new Error('Error parsing API response'));
              }
          });
      });

      req.on('error', (e) => {
          reject(e);
      });

      req.end();
  });
};
const transporter = nodemailer.createTransport({
  service: 'gmail', // Example with Gmail
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

const sendPatientEmail = async (patientEmail, booking) => {
  try {
    const patient = await Patient.findById(booking.patient);
    if (!patient) throw new Error('Patient not found');

    const doctor = await Doctor.findById(booking.doctor);
    if (!doctor) throw new Error('Doctor not found');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: patientEmail,
      subject: '📅 Your Appointment is Booked!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #F4F7FC;">
          <h2 style="text-align: center; color: #FF7F50;">Appointment Successfully Booked!</h2>
          <p style="font-size: 16px; color: #272848;">Dear <strong>${patient.name}</strong>,</p>
          <p style="font-size: 16px; color: #272848;">Your appointment with <strong>Dr. ${doctor.name}</strong> on <strong>${booking.date.toDateString()}</strong> at <strong>${booking.time}</strong> has been successfully booked.</p>
          
          <p style="font-size: 16px; color: #272848;">You will receive a confirmation once Dr. ${doctor.name} confirms the appointment. We will notify you with further updates soon.</p>
          
          <p style="font-size: 16px; color: #272848;">If you have any questions or need to reschedule, feel free to contact us.</p>
          
          <p style="font-size: 16px; color: #272848;">Thank you for choosing MedxBay!</p>
          
          <p style="font-size: 16px; color: #272848;"><strong>Best regards,</strong></p>
          <p style="font-size: 16px; color: #272848;"><strong>The MedxBay Team</strong></p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 14px; color: #777;">P.S. If you didn’t schedule this appointment, please contact us immediately.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log('Email sent to patient:', patientEmail);
  } catch (error) {
    console.error('Error sending email to patient:', error.message);
  }
};

const sendDoctorEmail = async (doctorEmail, booking) => {
  try {
    const doctor = await Doctor.findById(booking.doctor);
    if (!doctor) throw new Error('Doctor not found');

    const patient = await Patient.findById(booking.patient);
    if (!patient) throw new Error('Patient not found');

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: doctorEmail,
      subject: '📅 New Appointment Booked with a Patient',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #F4F7FC;">
          <h2 style="text-align: center; color: #FF7F50;">New Appointment Notification</h2>
          <p style="font-size: 16px; color: #272848;">Dear Dr. <strong>${doctor.name}</strong>,</p>
          <p style="font-size: 16px; color: #272848;">You have a new appointment with the following details:</p>
          
          <ul style="font-size: 16px; color: #272848; list-style-type: none; padding: 0;">
            <li><strong>Patient Name:</strong> ${patient.name}</li>
            <li><strong>Date:</strong> ${booking.date.toDateString()}</li>
            <li><strong>Time:</strong> ${booking.time}</li>
          </ul>
          
          <p style="font-size: 16px; color: #272848;">Kindly update the status of the booking at your earliest convenience.</p>
          
          <p style="font-size: 16px; color: #272848;">Thank you for using MedxBay!</p>
          
          <p style="font-size: 16px; color: #272848;"><strong>Best regards,</strong></p>
          <p style="font-size: 16px; color: #272848;"><strong>The MedxBay Team</strong></p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 14px; color: #777;">P.S. If you have not scheduled this appointment, please contact support immediately.</p>
        </div>
      `
    };
    await transporter.sendMail(mailOptions);
    console.log('Email sent to doctor:', doctorEmail);
  } catch (error) {
    console.error('Error sending email to doctor:', error.message);
  }
};

function isLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role === 'patient') {
    req.user = req.session.user;
    return next();
  }
  

  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }
  

  res.redirect('/auth/login');
}



router.get('/patient-index', async (req, res) => {
  try {
    const highPriorityBlogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).limit(5).exec();
      const patientEmail = req.session.user.email; 
      const patient = await Patient.findOne({email: patientEmail}).lean(); 

      res.render('patient-index', { blogs: highPriorityBlogs, patient });
  } catch (error) {
      console.error('Error fetching high-priority blogs:', error);
      res.status(500).send('Internal Server Error');
  }
});

router.get('/profile', isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    const patient = await Patient.findOne({ email: patientEmail }).lean();
    if (!patient) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    res.status(200).json({ patient });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server Error' });
  }
});


router.get('/edit', isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    const patient = await Patient.findOne({ email: patientEmail }).lean();
    if (!patient) {
      return res.status(404).send('Patient not found');
    }
    res.render('editPatientProfile', { patient });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/profile/update', upload.single('profilePicture'), isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    let patient = await Patient.findOne({ email: patientEmail });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    const updateData = {
      ...req.body,
      emergencyContacts: Array.isArray(req.body.emergencyContacts) ? req.body.emergencyContacts.map(contact => ({
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        email: contact.email
      })) : []
    };

    if (req.file) {
      updateData.profilePicture = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    Object.assign(patient, updateData);

    await patient.save();

    res.redirect('/patient/profile');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


router.get('/doctors', async (req, res) => {
  try {
    const sortOption = req.query.sort;
    let sortCriteria;

    switch (sortOption) {
      case 'mostReviewed':
        sortCriteria = { consultationsCompleted: -1 };
        break;
      case 'highestRated':
        sortCriteria = { rating: -1 };
        break;
      case 'mostViewed':
        sortCriteria = { profileViews: -1 };
        break;
      default:
        sortCriteria = {};
    }

    const doctors = await Doctor.find({ verified: 'Verified' })
      .populate({
        path: 'hospitals',
        select: 'name city lat lng -_id'
      })
      .sort(sortCriteria);

    doctors.forEach(doctor => {
      if (doctor.profilePicture && doctor.profilePicture.data) {
        const base64Image = doctor.profilePicture.data.toString('base64');
        doctor.profileImage = `data:${doctor.profilePicture.contentType};base64,${base64Image}`;
      } else {
        doctor.profileImage = '/path/to/default/profile/pic.png';
      }
    });

    const locationSet = new Map();

    doctors.forEach(doctor => {
      doctor.timeSlots.forEach(slot => {
        if (slot.status === 'free' && slot.lat && slot.lng) {
          const key = `${slot.lat},${slot.lng}`;

          if (!locationSet.has(key)) {
            const hospital = doctor.hospitals && doctor.hospitals[0] ? doctor.hospitals[0] : {}; 

            locationSet.set(key, {
              doctorId: doctor._id,
              subscriptionType: doctor.subscriptionType,
              lat: slot.lat,
              lng: slot.lng,
              city: hospital.city || "N/A",
              hospitalName: hospital.name || "N/A",  
              doctorName: doctor.name || "N/A",      
              doctorTitle: doctor.title || "N/A",    
              doctorImage: doctor.profileImage || 'N/A' 
            });
          }
        }
      });
    });

    const uniqueLocations = Array.from(locationSet.values());

    const countries = await Doctor.distinct('country');
    const states = await Doctor.distinct('state');
    const hospitals = doctors.flatMap(doctor => doctor.hospitals);
    const cities = Array.from(new Set(hospitals.map(hospital => hospital.city))).filter(city => city !== undefined);
    const specialities = await Doctor.distinct('speciality');
    const languages = await Doctor.distinct('languages');
    const genders = await Doctor.distinct('gender');

    res.json({
      doctors,
      countries,
      states,
      cities,
      specialities,
      languages,
      genders,
      uniqueLocations 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});



router.get('/doctors/:id/slots', async (req, res) => {
  try {
      const doctorId = req.params.id;
      console.log('Fetching doctor with ID:', doctorId); // Log doctor ID
      const doctor = await Doctor.findById(doctorId)
          .populate({
              path: 'reviews.patientId',
              select: 'name'
          });

      if (!doctor) {
          console.log('Doctor not found');
          return res.status(404).send('Doctor not found');
      }
      const insurances = await Insurance.find({ '_id': { $in: doctor.insurances } }).select('name logo');
      console.log('Insurances:', insurances); // Log insurance data

      const blogs = await Blog.find({ authorId: doctorId, verificationStatus: 'Verified' });
      console.log('Blogs:', blogs); // Log blogs data

      const conversionRates = await fetchConversionRates();
      console.log('Conversion rates:', conversionRates); // Log conversion rates

      const doctorFeeCurrency = doctor.doctorFeeCurrency || 'usd';
      const selectedCurrency = req.query.currency || 'usd'; 

      const inrRate = conversionRates.INR || 82.5;  
      const gbpRate = conversionRates.GBP || 0.73;  
      const aedRate = conversionRates.AED || 3.67; 

      let feeInUSD = doctor.doctorFee;
      if (doctorFeeCurrency !== 'usd') {
          feeInUSD = doctor.doctorFee / conversionRates[doctorFeeCurrency.toUpperCase()] || feeInUSD;
      }

      const feesInAllCurrencies = {
          usd: feeInUSD,
          inr: feeInUSD * inrRate,
          gbp: feeInUSD * gbpRate,
          aed: feeInUSD * aedRate
      };

      for (let currency in feesInAllCurrencies) {
          feesInAllCurrencies[currency] = feesInAllCurrencies[currency].toFixed(2);
      }

      const totalFee = feesInAllCurrencies[selectedCurrency.toLowerCase()];
      console.log('Total fee in selected currency:', totalFee); // Log total fee

 
      res.json({ doctor, insurances, blogs, feesInAllCurrencies, totalFee, selectedCurrency });
  } catch (error) {
      console.error('Error occurred:', error.message);
      res.status(500).json({ error: 'Server Error' });
  }
});


// router.post('/book', isLoggedIn, async (req, res) => {
//   try {
//       const { doctorId, date, startTime, consultationType } = req.body;
//       const patientId = req.session.user._id;

   
//       console.log('Request body:', req.body);
//       console.log('Patient ID:', patientId);

//       const doctor = await Doctor.findById(doctorId);
//       if (!doctor) {
//           return res.status(404).json({ error: 'Doctor not found' });
//       }

 

//       const requestDateString = new Date(date).toDateString();

//       const slot = doctor.timeSlots.find(slot =>
//           new Date(slot.date).toDateString() === requestDateString && slot.startTime === startTime
//       );

//       if (!slot) {
//           return res.status(400).json({ error: 'Time slot not found' });
//       }

//       const booking = new Booking({
//           patient: patientId,
//           doctor: doctorId,
//           date: new Date(date),
//           time: `${slot.startTime} - ${slot.endTime}`,
//           consultationType: consultationType,
//           status: 'waiting',
//           hospital: {
//               name: slot.hospital,
//               location: slot.hospitalLocation
//           }
//       });
//       console.log('Booking data to save:', booking);
//       await booking.save();

//       slot.status = 'booked';
//       await doctor.save();

//       res.status(200).json({ message: 'Booking successful' });
//   } catch (error) {
//       console.error(error.message);
//       res.status(500).json({ error: 'Server error' });
//   }
// });
router.post('/book', isLoggedIn, async (req, res) => {
  console.log(req.body);
  
  try {
    const { doctorId, date, startTime, consultationType, currency } = req.body;
    const patientId = req.session.user._id;

    // Validate date and time format
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime()) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime)) {
      return res.status(400).send('Invalid date or start time format');
    }
    // Fetch doctor and patient
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).send('Patient not found');
    }
    
    // Check availability of the requested time slot
    const slotIndex = doctor.timeSlots.findIndex(slot =>
      slot.date.toISOString() === new Date(date).toISOString() && slot.startTime === startTime
    );
    if (slotIndex === -1) {
      return res.status(400).send('Time slot not found');
    }
    console.log(consultationType)
    if (consultationType === 'In-person') {
      // Create and save booking for in-person consultation
      const booking = new Booking({
        patient: patientId,
        doctor: doctorId,
        date: new Date(date),
        time: `${doctor.timeSlots[slotIndex].startTime} - ${doctor.timeSlots[slotIndex].endTime}`,
        consultationType: consultationType,
        status: 'waiting',
        hospital: {
          name: doctor.timeSlots[slotIndex].hospital,
          location: doctor.timeSlots[slotIndex].hospitalLocation
        }
      });

      await booking.save();

      // Update the doctor's time slot status to booked
      doctor.timeSlots[slotIndex].status = 'booked';
      await doctor.save();

      // Send email notifications
      await sendPatientEmail(patient.email, booking);
      await sendDoctorEmail(doctor.email, booking);

      // Redirect to patient's bookings page
      return res.json({status:200, msg:"Success"});
    } else if (consultationType === 'video call') {
      // Fetch conversion rates
      console.log("Inside video call loop")
      const conversionRates = await fetchConversionRates();

      // Determine the fee and handle currency conversion
      const doctorFeeCurrency = doctor.doctorFeeCurrency || 'usd';
      let totalFee = doctor.doctorFee;

      if (doctorFeeCurrency !== currency.toLowerCase()) {
        if (!(currency.toUpperCase() in conversionRates)) {
          return res.status(400).send('Invalid currency selected');
        }

        // Adjust fee based on conversion rates
        totalFee = totalFee / conversionRates[doctorFeeCurrency.toUpperCase()] * conversionRates[currency.toUpperCase()];
      }

      // Create a Stripe checkout session for video consultation payment
      console.log("Before stripe")
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: `Appointment Booking for Dr. ${doctor.name}: ${consultationType} on ${parsedDate.toLocaleDateString()} at ${startTime}`,
            },
            unit_amount: Math.round(totalFee * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        metadata: {
          doctorId: doctorId.toString(),
          date: date,
          startTime: startTime,
          consultationType: consultationType,
          totalFee: totalFee.toFixed(2),
          doctorFeeCurrency: doctorFeeCurrency  
        },
        success_url: `${req.protocol}://${req.get('host')}/api/patient/book/payment-success?doctorId=${doctorId}&date=${encodeURIComponent(date)}&startTime=${encodeURIComponent(startTime)}&consultationType=${consultationType}&currency=${currency}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${req.protocol}://${req.get('host')}/api/patient/book/payment-failure`,
      });
      console.log("After stripe")
      console.log(session);
      

      // Redirect to Stripe checkout
      console.log(session.url)
      return res.json({ url: session.url });
    }
  } catch (error) {
    console.error('Error creating Stripe session or booking:', error.message);
    res.status(500).send('Server Error');
  }
});


router.get('/book/payment-success', async (req, res) => {
  try {
    const { doctorId, date, startTime, consultationType, session_id } = req.query;
    const patientId = req.session.user._id;

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === 'paid') {
      const doctor = await Doctor.findById(doctorId);
      const patient = await Patient.findById(patientId);
      if (!doctor) {
        return res.status(404).send('Doctor not found');
      }

      const slotIndex = doctor.timeSlots.findIndex(slot =>
        slot.date.toISOString() === new Date(date).toISOString() && slot.startTime === startTime
      );
      if (slotIndex === -1) {
        return res.status(400).send('Time slot not found');
      }

      doctor.timeSlots[slotIndex].status = 'booked';

      let totalFee = doctor.doctorFee;
      let serviceCharge = 0;

      if (doctor.subscriptionType === 'Standard') {
        serviceCharge = (3 / 100) * doctor.doctorFee;
        totalFee -= serviceCharge;
      }


      const booking = new Booking({
        patient: patientId,
        doctor: doctorId,
        date: new Date(date),
        time: `${doctor.timeSlots[slotIndex].startTime} - ${doctor.timeSlots[slotIndex].endTime}`,
        consultationType: consultationType,
        status: 'waiting',
        payment: totalFee,
        paid: 'true'
      });

      await booking.save();

      await sendPatientEmail(patient.email, booking);
      await sendDoctorEmail(doctor.email, booking);

      res.render('patient-payment-success', { booking });
    } else {
      res.status(400).send('Payment not completed');
    }
  } catch (error) {
    console.error('Error processing payment success:', error.message);
    res.status(500).send('Server Error');
  }
});



router.get('/bookings', isLoggedIn, async (req, res) => {
  try {
    const bookings = await Booking.find({ patient: req.session.user._id }).populate('doctor');
    res.json({ bookings });
    console.log({bookings});
    
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ message: 'Server Error' });
  }
});


router.get('/review/:doctorId/:bookingId', isLoggedIn, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.doctorId);
    const booking = await Booking.findById(req.params.bookingId);

    if (!doctor || !booking) {
      return res.status(404).send('Doctor or booking not found');
    }

    res.render('reviewForm', { doctor, booking });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.post('/review/:doctorId/:bookingId', isLoggedIn, async (req, res) => {
  try {
    const { rating, reviewText } = req.body;

    const doctor = await Doctor.findById(req.params.doctorId);
    const booking = await Booking.findById(req.params.bookingId);

    if (!doctor || !booking) {
      return res.status(404).send('Doctor or booking not found');
    }

    doctor.reviews.push({
      patientId: req.session.user._id,
      rating,
      reviewText
    });

    await doctor.save();

    res.redirect('/patient/bookings'); 
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.post('/add-to-favorites', isLoggedIn, async (req, res) => {
  try {
    const { doctorId } = req.body;
    const patientId = req.session.user._id;

    const patient = await Patient.findById(patientId);
    const doctor = await Doctor.findById(doctorId);

    if (!patient || !doctor) {
      return res.status(404).send('Patient or Doctor not found');
    }

    if (!patient.favoriteDoctors) {
      patient.favoriteDoctors = []; 
    }

    if (patient.favoriteDoctors.includes(doctorId)) {
      return res.status(400).send('Doctor already in favorites');
    }

    patient.favoriteDoctors.push(doctorId);
    await patient.save();

    res.redirect('/patient/doctors'); 
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).send('Server error');
  }
});


router.get('/favorites', isLoggedIn, async (req, res) => {
  try {
    const patientId = req.session.user._id;
    const patient = await Patient.findById(patientId).populate({
      path: 'favoriteDoctors',
      model: 'Doctor'
    });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    res.render('patientFavorites', { favoriteDoctors: patient.favoriteDoctors });
  } catch (error) {
    console.error('Error fetching favorite doctors:', error);
    res.status(500).send('Server error');
  }
});


router.get('/calendar', isLoggedIn, async (req, res) => {
  try {
      const patientId = req.session.user._id; 
      const patient = await Patient.findById(patientId);
      if (!patient) {
          return res.status(404).send('Patient not found');
      }

      const currentDate = new Date();
      let currentMonth = parseInt(req.query.month) || currentDate.getMonth();
      let currentYear = parseInt(req.query.year) || currentDate.getFullYear();

      if (currentMonth < 0 || currentMonth > 11) {
          currentMonth = currentDate.getMonth();
      }
      if (currentYear < 1900 || currentYear > 2100) {
          currentYear = currentDate.getFullYear();
      }

      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

      const bookings = await Booking.find({
          patient: patientId,
          date: {
              $gte: new Date(currentYear, currentMonth, 1),
              $lte: new Date(currentYear, currentMonth, daysInMonth, 23, 59, 59)
          },
          status: 'accepted'
      });

      res.render('patientCalendar', {
          patient,
          currentMonth,
          currentYear,
          daysInMonth,
          bookings,
          today: currentDate,
          months: [
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'
          ]
      });
  } catch (error) {
      console.error('Error fetching calendar data:', error);
      res.status(500).send('Server error');
  }
});

router.get('/blogs/view/:id', async (req, res) => {
  try {
      const blogId = req.params.id;
      const blog = await Blog.findById(blogId).lean();

      if (!blog) {
          return res.status(404).json({ error: 'Blog not found' });
      }

      res.json({ blog });
  } catch (err) {
      console.error(err.message);
      res.status(500).json({ error: 'Server Error' });
  }
});




router.post('/blogs/comment/:id', isLoggedIn, async (req, res) => {
  try {
      const { comment } = req.body;
      const blogId = req.params.id;
      const blog = await Blog.findById(blogId);

      if (!blog) {
          return res.status(404).send('Blog not found');
      }
      console.log(req.session.user.name)
      blog.comments.push({
          username: req.session.user.name, 
          comment: comment
      });

      await blog.save();

      req.flash('success_msg', 'Comment added successfully');
      res.redirect(`/patient/blogs/view/${blogId}`);
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});

router.get('/author/:id', async (req, res) => {
  try {
    const authorId = req.params.id;

    let author = await Doctor.findById(authorId);

    if (!author) {
      author = await Admin.findById(authorId);
    }

    if (!author) {
      return res.status(404).send('Author not found');
    }

    const blogCount = await Blog.countDocuments({ authorId });

    res.render('author-info', {
      author,
      blogCount
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});
router.get('/priority-blogs', async (req, res) => {
    try {
      const blogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).lean();

      res.render('priorityblogs', { blogs });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  router.get('/blogs', async (req, res) => {
    try {
        const { search } = req.query;
        let filter = { verificationStatus: 'Verified' };

        // Create a regex for search functionality
        if (search) {
            const regex = new RegExp(escapeRegex(search), 'gi');
            filter = {
                verificationStatus: 'Verified',
                $or: [
                    { title: regex },
                    { categories: regex },
                    { hashtags: regex }
                ]
            };
        }

        // Retrieve distinct categories and hashtags
        const categories = await Blog.distinct('categories', { verificationStatus: 'Verified' });
        // Retrieve unique hashtags and remove the '#' symbol
        let hashtags = await Blog.distinct('hashtags', { verificationStatus: 'Verified' });
        hashtags = hashtags.map(hashtag => hashtag.replace('#', ''));

        // Count the number of blogs per category
        const categoryCounts = await Blog.aggregate([
            { $match: { verificationStatus: 'Verified' } },
            { $unwind: '$categories' },
            { $group: { _id: '$categories', count: { $sum: 1 } } }
        ]);

        // Count the number of blogs per hashtag
        const hashtagCounts = await Blog.aggregate([
            { $match: { verificationStatus: 'Verified' } },
            { $unwind: '$hashtags' },
            { $group: { _id: '$hashtags', count: { $sum: 1 } } }
        ]);

        // Convert aggregate results to a more usable format
        const categoryCountMap = categoryCounts.reduce((map, item) => {
            map[item._id] = item.count;
            return map;
        }, {});

        const hashtagCountMap = hashtagCounts.reduce((map, item) => {
            const cleanHashtag = item._id.replace('#', ''); // Clean the hashtag
            map[cleanHashtag] = item.count;
            return map;
        }, {});

        // Find high-priority blogs (featured blogs)
        const featuredBlogs = await Blog.find({ 
            priority: 'high', 
            verificationStatus: 'Verified' 
        }).sort({ createdAt: -1 }).limit(5).lean();

        // Find recent blogs
        const recentBlogs = await Blog.find(filter).sort({ createdAt: -1 }).limit(5).lean();

        // Group blogs by categories
        const blogsByCategory = {};
        for (const category of categories) {
            blogsByCategory[category] = await Blog.find({ 
                categories: category, 
                verificationStatus: 'Verified' 
            }).sort({ createdAt: -1 }).lean();
        }

        // Find most-read blogs
        const mostReadBlogs = await Blog.find(filter).sort({ reads: -1 }).limit(5).lean(); // Assuming 'reads' tracks the number of views

        // Find top-rated doctors
        const topRatedDoctors = await Doctor.find({ 
            rating: { $gte: 4.5 }, // Assuming rating is out of 5
            subscriptionVerification: 'Verified' 
        }).sort({ rating: -1 }).limit(5).lean();

        console.log(topRatedDoctors);
        // Render the view with blogs, categories, hashtags, top-rated doctors, and additional sections
        res.json({ 
            featuredBlogs,
            recentBlogs,
            blogsByCategory,
            mostReadBlogs,
            topRatedDoctors,
            searchQuery: search,
            categories,
            hashtags,
            categoryCounts: categoryCountMap,
            hashtagCounts: hashtagCountMap
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

router.get('/dashboard', isLoggedIn, async (req, res) => {
  try {
    const patient = await Patient.findOne({ email: req.user.email }).lean();
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    const chats = await Chat.find({ patientId: patient._id })
            .populate('doctorId', 'name profilePicture') // Assuming patient has a profilePicture field
            .sort({ updatedAt: -1 })
            .lean(); 

    chats.forEach(chat => {
      chat.unreadCount = chat.messages.filter(message => 
        !message.read && message.senderId.toString() !== patient._id.toString()
      ).length;
    });

    return res.json({ patient, chats });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: 'Server Error' });
  }
});
router.get('/chat/:id', isLoggedIn, async (req, res) => {
  try {
    const chatId = req.params.id;
    const chat = await Chat.findById(chatId)
        .populate('doctorId', 'name email profilePicture') 
        .lean();

    if (!chat) {
      return res.status(404).send('Chat not found');
    }

    chat.messages.forEach(message => {
      if (message.senderId.toString() !== req.user._id.toString() && !message.read) {
        message.read = true;
      }
    });

    await Chat.updateOne({ _id: chatId }, { $set: { messages: chat.messages } });
    
    res.json({ 
      chat, 
      doctorProfilePicture: chat.doctorId.profilePicture 
    });


  } catch (err) {
    console.error(err.message);
    return res.status(500).json({ error: 'Server Error' });
  }
});

router.post('/chats/:chatId/send-message', isLoggedIn, async (req, res) => {
  try {
    const { message } = req.body;
    const patient = await Patient.findOne({ email: req.session.user.email });
    const chatId = req.params.chatId;

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    let chat = await Chat.findOneAndUpdate(
      { _id: chatId, patientId: patient._id },
      { $push: { messages: { senderId: patient._id, text: message, timestamp: new Date(), read: false } } },
      { new: true }
    ).populate('doctorId');

    if (!chat) {
      return res.status(404).send('Chat not found');
    }

    if (chat.doctorId) {
      await Notification.create({
        userId: chat.doctorId._id,
        message: `New message from ${patient.name}: ${message}`, 
        type: 'chat',
        chatId: chat._id,
        read: false,
        createdAt: new Date()
      });
    }

    res.json({ chat });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: 'Server Error' });
  }
});



router.get('/prescriptions', isLoggedIn, async (req, res) => {
  try {
    const patientId = req.session.user._id;
    const patientPrescriptions = await Prescription.find({ patientId: patientId })
      .sort({ createdAt: 'desc' });

    res.json(patientPrescriptions); // Send the data as JSON
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});


const fontPaths = {
  regular: path.join(__dirname, '../fonts/Matter-Regular.ttf'),
  bold: path.join(__dirname, '../fonts/Matter-Bold.ttf'),
  italic: path.join(__dirname, '../fonts/Matter-RegularItalic.ttf'),
  boldItalic: path.join(__dirname, '../fonts/Matter-BoldItalic.ttf'),
  semiBold: path.join(__dirname, '../fonts/Matter-SemiBold.ttf'),
  medium: path.join(__dirname, '../fonts/Matter-Medium.ttf')
};

router.get('/prescriptions/:id/download', isLoggedIn, async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate('doctorId', 'name speciality')
      .exec();

    if (!prescription) {
      return res.status(404).send('Prescription not found');
    }

    const doctor = prescription.doctorId;
    const booking = await Booking.findOne({
      patient: prescription.patientId,
      doctor: prescription.doctorId
    });

    if (!booking) {
      return res.status(404).send('Booking not found');
    }

    const hospital = booking.hospital;
    const doc = new PDFDocument({ margin: 40 });
    const fileName = `prescription-${prescription._id}.pdf`;
    const prescriptionsDir = path.join(__dirname, '../public/prescriptions');

    if (!fs.existsSync(prescriptionsDir)) {
      fs.mkdirSync(prescriptionsDir, { recursive: true });
    }

    const filePath = path.join(prescriptionsDir, fileName);

    doc.registerFont('Matter-Regular', fontPaths.regular);
    doc.registerFont('Matter-Bold', fontPaths.bold);
    doc.registerFont('Matter-Italic', fontPaths.italic);
    doc.registerFont('Matter-BoldItalic', fontPaths.boldItalic);
    doc.registerFont('Matter-SemiBold', fontPaths.semiBold);
    doc.registerFont('Matter-Medium', fontPaths.medium);

    doc.info.Title = 'E-Prescription';
    doc.info.Author = 'MedxBay';

    const backgroundColor = '#F4F7FC';
    const textColor = '#272848';
    const lineColor = '#b0baca'; 

    const addHeaderFooter = () => {
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(backgroundColor);

      const logoX = 40;
      const titleX = 45;
      const doctorInfoX = 400;
      const headerY = 40;
      const watermarkX = (doc.page.width - 225) / 2;
      const watermarkY = (doc.page.height - 115) / 2;

      doc.opacity(0.08).image('logo.png', watermarkX, watermarkY, { width: 220 }).opacity(1);

      doc.image('logo.png', logoX, headerY, { width: 115 })
        .font('Matter-Medium')
        .fontSize(18)
        .fillColor(textColor)
        .text('E-Prescription', titleX, headerY, { align: 'center' })
        .fontSize(10)
        .font('Matter-Regular')
        .text('MedxBay', titleX, headerY + 19, { align: 'center' })
        .font('Matter-Italic')
        .fontSize(10)
        .text('Your Trusted Health Partner', titleX, headerY + 31, { align: 'center' })
        .moveDown(1.5);

      doc.font('Matter-SemiBold').fontSize(12).fillColor(textColor)
        .text(` ${doctor.name}`, doctorInfoX, headerY, { align: 'right' })
        .font('Matter-Regular')
        .text(`${doctor.speciality.join(', ')}`, doctorInfoX, headerY + 15, { align: 'right' })
        .font('Matter-Italic')
        .text(`${prescription.doctorEmail}`, doctorInfoX, headerY + 30, { align: 'right' })
        .moveDown(2);

        doc.fillColor(lineColor).moveTo(40, headerY + 60).lineTo(570, headerY + 60).stroke(lineColor);
    };

    addHeaderFooter();

    const patientName = `Patient Name: ${prescription.patientName}`;
    const patientAge = `Patient Age: ${prescription.patientAge}`;
    const consultationDate = `Consultation Date: ${prescription.meetingDate.toISOString().split('T')[0]}`;
    const consultationTime = `Consultation Time: ${prescription.meetingTime}`;

    doc.font('Matter-Regular').fontSize(12).fillColor(textColor)
      .text(patientName, 40)
      .moveDown(0.5)
      .text(patientAge)
      .moveDown(0.5)
      .text(consultationDate)
      .moveDown(0.5)
      .text(consultationTime)
      .moveDown(1.5);

    doc.fontSize(14).font('Matter-Medium').fillColor(textColor)
      .text('Medicines', { underline: true })
      .moveDown()
      .font('Matter-Regular').fontSize(12);

    const medicineLineSpacing = 0.5;
    let medicineCount = 0;

    prescription.medicines.forEach((medicine) => {
      if (medicineCount >= 4 || (doc.y + 60 > doc.page.height - 100)) {
        doc.addPage();
        addHeaderFooter();
        medicineCount = 0;
      }

      doc.font('Matter-SemiBold').fillColor(textColor)
        .text(`• Name: ${medicine.name}`)
        .moveDown(medicineLineSpacing)
        .font('Matter-Regular')
        .text(`  - Dosage: ${medicine.dosage}`)
        .moveDown(medicineLineSpacing)
        .text(`  - Before Food: ${medicine.beforeFood ? 'Yes' : 'No'}`)
        .moveDown(medicineLineSpacing)
        .text(`  - After Food: ${medicine.afterFood ? 'Yes' : 'No'}`)
        .moveDown(medicineLineSpacing)
        .text(`  - Timing: Morning: ${medicine.timing.morning ? 'Yes' : 'No'}, Afternoon: ${medicine.timing.afternoon ? 'Yes' : 'No'}, Night: ${medicine.timing.night ? 'Yes' : 'No'}`)
        .moveDown(1);

      medicineCount++;
    });

    doc.moveDown(2).font('Matter-SemiBold').fillColor(textColor)
      .text('Doctor\'s Signature')  
      .moveDown(0.4)
      .font('Matter-Italic')
      .text(doctor.name, { fontSize: 14 }); 

      const footerY = doc.page.height - 90; 

      doc.moveTo(40, footerY).lineTo(570, footerY).stroke();

    doc.y = footerY + 10;
    doc.moveDown(0.5).font('Matter-Medium').fontSize(12).fillColor(textColor)
      .text(hospital.name, { align: 'center' })
      .moveDown(0.4)
      .font('Matter-Italic').fontSize(10)
      .text(
        `${hospital.location.street}, ${hospital.location.city}, ${hospital.location.state}, ${hospital.location.country} - ${hospital.location.zip}`,
        { align: 'center' }
      );

    doc.pipe(fs.createWriteStream(filePath)).on('finish', () => {
      res.setHeader('Content-disposition', 'attachment; filename=' + fileName);
      res.setHeader('Content-type', 'application/pdf');
      fs.createReadStream(filePath).pipe(res);
    });

    doc.end();
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});
router.get('/notifications', isLoggedIn, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user._id }).lean();

    const chatNotifications = notifications.filter(notification => notification.type === 'chat');
    const otherNotifications = notifications.filter(notification => notification.type !== 'chat');

    const chatDetailsPromises = chatNotifications.map(async (notification) => {
      try {
        if (!notification.chatId) {
          console.warn(`No chatId for notification ${notification._id}`);
          return {
            ...notification,
            senderName: 'Unknown',
            senderProfilePic: null,
            message: 'No message available',
            timeAgo: timeSince(notification.createdAt) 
          };
        }

        const chat = await Chat.findById(notification.chatId)
                              .populate('doctorId patientId')
                              .lean();

        if (!chat) {
          console.warn(`Chat not found for notification ${notification._id}`);
          return {
            ...notification,
            senderName: 'Unknown',
            senderProfilePic: null,
            message: 'No message available',
            timeAgo: timeSince(notification.createdAt) 
          };
        }

        const sender = chat.doctorId._id.toString() === req.user._id.toString() ? chat.patientId : chat.doctorId;

        return {
          ...notification,
          senderName: sender.name || 'Unknown',
          senderProfilePic: sender.profilePicture ? `data:${sender.profilePicture.contentType};base64,${sender.profilePicture.data.toString('base64')}` : null,
          message: notification.message,
          timeAgo: timeSince(notification.createdAt) 
        };
      } catch (err) {
        console.error(`Error fetching chat details for notification ${notification._id}:`, err);
        return {
          ...notification,
          senderName: 'Error',
          senderProfilePic: null,
          message: 'Error fetching message',
          timeAgo: timeSince(notification.createdAt) 
        };
      }
    });

    const chatNotificationsWithDetails = await Promise.all(chatDetailsPromises);

    const allNotifications = [...chatNotificationsWithDetails, ...otherNotifications].map(notification => ({
      ...notification,
      timeAgo: timeSince(notification.createdAt)
    }));

    // Send JSON response instead of rendering an HTML page
    
    res.json({ notifications: allNotifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Server Error' });
  }
});


function timeSince(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  let interval = Math.floor(seconds / 31536000);

  if (interval > 1) {
    return interval + " years ago";
  }
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) {
    return interval + " months ago";
  }
  interval = Math.floor(seconds / 86400);
  if (interval > 1) {
    return interval + " days ago";
  }
  interval = Math.floor(seconds / 3600);
  if (interval > 1) {
    return interval + " hours ago";
  }
  interval = Math.floor(seconds / 60);
  if (interval > 1) {
    return interval + " minutes ago";
  }
  return Math.floor(seconds) + " seconds ago";
}

router.post('/notifications/:id/mark-read', isLoggedIn, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error' });
  }
});

  
  
router.post('/notifications/:id/delete', isLoggedIn, async (req, res) => {
  try {
    await Notification.findByIdAndDelete(req.params.id);
    res.json({ message: 'Notification deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server Error' });
  }
});




module.exports = router;