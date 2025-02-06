const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const otpGenerator = require('otp-generator');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const querystring = require('querystring');
const Corporate = require('../models/Corporate');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const router = express.Router();
const Blog = require('../models/Blog');
const Booking = require('../models/Booking');
const Specialty = require('../models/Specialty');
const Chat = require('../models/Chat');
function isLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role === 'corporate') {
    req.user = req.session.user;
    return next();
  }
  res.redirect('/corporate/login');
}

function isCorporate(req, res, next) {
  const corporateId = req.session.user?._id; // Get corporate ID from session

  if (corporateId) {
    req.user = req.session.user; // Attach user info to request
    return next();
  }

  res.redirect('/corporate/login'); // Redirect if not logged in
}

const generateVerificationToken = () => {
  return crypto.randomBytes(20).toString('hex');
};

const sendVerificationEmail = async (name, email, token, role) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const verificationLink = `${process.env.NODE_URL}/corporate/verify-email?token=${token}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: '🎉 Almost There! Verify Your Email to Complete Your Sign-Up 🎉',
    html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="text-align: center;">
            <span style="color: #FF7F50;">Welcome to MedxBay!</span> 
          </h2>
          
          <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
    
          <p style="font-size: 16px;">Thank you for signing up with us! We’re thrilled to have you on board and can’t wait for you to explore everything we have in store.</p>
    
          <p style="font-size: 16px;">Before you dive in, we just need one small thing from you: to confirm your email address. This helps us ensure that we’ve got the right contact details for you and keeps your account secure.</p>
    
          <h3 style="color: #272848;">Here’s What You Need to Do:</h3>
    
          <p style="font-size: 16px;">Click the button below to verify your email address:</p>
    
          <div style="text-align: center; margin: 20px 0;">
            <a href="${verificationLink}" style="padding: 14px 24px; color: white; background-color: #FF7F50; text-decoration: none; border-radius: 5px; font-size: 16px;">Verify Your Email Address</a>
          </div>
    
          <p style="font-size: 16px;">Or, copy and paste this link into your browser:</p>
          <p style="word-break: break-all; font-size: 16px;"><a href="${verificationLink}" style="color: #272848;">${verificationLink}</a></p>
    
          <p style="font-size: 16px;">Once you’ve verified your email, you’ll be all set to access your new account and start exploring. If you have any questions or need assistance, feel free to reach out to our support team—we’re here to help!</p>
    
          <p style="font-size: 16px; text-align: center;"><strong>Welcome aboard, and get ready for an amazing experience with MedxBay!</strong></p>
    
          <p style="font-size: 16px;">Best regards,</p>
          <p style="font-size: 16px;"><strong>The MedxBay Team</strong></p>
    
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          
          <p style="font-size: 14px; color: #777;">P.S. If you didn’t sign up for an account, please disregard this email. No worries—nothing will change if you ignore it.</p>
        </div>
      `
  };



  await transporter.sendMail(mailOptions);
};

const sendSignupNotificationToAdmin = async (userData, role) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD,
    },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: process.env.ADMIN_EMAIL, 
    subject: `🔔 New ${role.charAt(0).toUpperCase() + role.slice(1)} Signup Notification`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="text-align: center; color: #FF7F50;">New ${role.charAt(0).toUpperCase() + role.slice(1)} Signup</h2>
        
        <p style="font-size: 16px;">Hello Admin,</p>
        
        <p style="font-size: 16px;">A new ${role} has signed up on MedxBay. Here are the details:</p>
        
        <ul style="font-size: 16px; line-height: 1.6;">
          <li><strong>Name:</strong> ${userData.name}</li>
          <li><strong>Email:</strong> ${userData.email}</li>
          <li><strong>Phone Number:</strong> ${userData.phoneNumber}</li>
        </ul>
        
        <p style="font-size: 16px;">Please review this information and take any necessary actions.</p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        
        <p style="font-size: 14px; color: #777;">This is an automated notification. Please do not reply to this email.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const sendWelcomeEmail = async (name, email, role) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Welcome to MedxBay, ${name}!`,
    html: `
            <h2>Welcome, ${name}!</h2>
            <p>Thank you for verifying your account. You can now start using our platform.</p>
        `
  };

  await transporter.sendMail(mailOptions);
};

router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  try {
    const user = await Corporate.findOne({
      verificationToken: token,
      verificationTokenExpires: { $gt: Date.now() }
    });
    console.log(token);

    if (!user) {
      req.flash('error_msg', 'Invalid or expired verification link');
      return res.redirect(`https://medxbay.com`);
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpires = undefined;
    await user.save();

    await sendWelcomeEmail(user.corporateName, user.email, 'corporate');

    req.flash('success_msg', 'Your account has been verified. You can now log in.');
    return res.redirect(`${process.env.REACT_APP_BASE_URL}/login`);
  } catch (err) {
    console.error('Error in corporate email verification:', err);
    req.flash('error_msg', 'Server error');
    res.redirect(`${process.env.REACT_APP_BASE_URL}/corporate/signup`);
  }
});

router.get('/signup', (req, res) => {
  res.render('corporateSignup');
});

router.post('/signup', async (req, res) => {
  const { corporateName, email, mobileNumber, password } = req.body;

  try {
    const existingCorporate = await Corporate.findOne({ email });
    if (existingCorporate) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const token = generateVerificationToken();
    const tokenExpires = Date.now() + 3600000;

    const newCorporate = new Corporate({
      corporateName,
      email,
      mobileNumber,
      password: hashedPassword,
      verificationToken: token,
      verificationTokenExpires: tokenExpires,
      isVerified: false,
      role: 'corporate',
    });

    await newCorporate.save();


    await sendVerificationEmail(corporateName, email, token, 'corporate');

    await sendSignupNotificationToAdmin({ name: corporateName, email, phoneNumber: mobileNumber },'corporate');

    return res.redirect(`/corporate/login`);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});


router.get('/login', (req, res) => {
  res.json({
    messages: {
      success: req.flash('success_msg'),
      error: req.flash('error_msg')
    }
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const corporate = await Corporate.findOne({ email: email });

    if (!corporate) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/corporate/login');
    }

    if (!await bcrypt.compare(password, corporate.password)) {
      req.flash('error_msg', 'Invalid email or password');
      return res.redirect('/corporate/login');
    }

    if (!corporate.isVerified) {
      req.flash('error_msg', 'Please verify your account first');
      return res.redirect('/corporate/login');
    }

    req.session.corporateId = corporate._id;
    console.log(req.session.corporateId);
    req.flash('success_msg', 'Login successful!');
    res.redirect('/corporate/corporate-home');
  } catch (err) {
    console.error('Error in corporate login:', err);
    req.flash('error_msg', 'Server error');
    res.redirect('/corporate/login');
  }
});

router.get('/corporate-home', async (req, res) => {
  try {
    const corporateId = req.session.corporateId;
    console.log(req.session.corporateId);
    const corporate = await Corporate.findById(corporateId).populate('doctors');

    if (!corporate) {
      req.flash('error_msg', 'Corporate not found');
      return res.redirect('/corporate/login');
    }

    res.render('corporateHome', {
      corporate,
      doctors: corporate.doctors,
      followerCount: corporate.followers.length
    });
  } catch (err) {
    console.error('Error fetching corporate details:', err);
    req.flash('error_msg', 'Error fetching corporate details');
    res.redirect('/corporate/login');
  }
});

router.get('/profile', async (req, res) => {
  try {
    const corporateId = req.session.user._id;
    console.log(corporateId);
    

    const corporate = await Corporate.findById(corporateId)
      .populate('doctors')
      .populate({
        path: 'patientReviews.patientId',
        model: 'Patient',
        select: 'name profilePicture',
      })
      .populate({
        path: 'doctorReviews.doctorId',
        model: 'Doctor',
        select: 'name profilePicture',
      });

    if (!corporate) {
      return res.status(404).json({ success: false, message: 'Corporate profile not found' });
    }

    const verifiedBlogs = await Blog.find({
      authorId: { $in: corporate.doctors.map((doctor) => doctor._id) },
      verificationStatus: "Verified",
    })
      .select('title description image conditions authorId')
      .populate({
        path: 'authorId',
        model: 'Doctor',
        select: 'name profilePicture',
      });
      const inviteLinks = corporate.doctors.map(doctor => {
        return {
          inviteLink: `${process.env.NODE_URL}/doctor/accept-invite/${corporateId}/${doctor._id}`
        };
      });

    const responseData = {
      corporate: corporate,
      doctors: corporate.doctors,
      blogs: verifiedBlogs,
      doctorReviews: corporate.doctorReviews,
      patientReviews: corporate.patientReviews,
      inviteLinks,  
    };

    res.status(200).json({ success: true, data: responseData });
  } catch (err) {
    console.error('Error fetching corporate profile:', err);
    res.status(500).json({ success: false, message: 'Error fetching profile' });
  }
});


router.get('/edit-profile', async (req, res) => {
  try {
    const corporateId = req.session.user?._id;
    const corporate = await Corporate.findById(corporateId);

    if (!corporate) {
      req.flash('error_msg', 'Corporate profile not found');
      return res.redirect('/corporate/corporate-home');
    }
    const specialties = await Specialty.find();

    res.json({
      corporate,
      specialties 
    });
  } catch (err) {
    console.error('Error fetching corporate profile for editing:', err);
    req.flash('error_msg', 'Error fetching corporate profile');
    res.redirect('/corporate/corporate-home');
  }
});
router.post('/edit-profile', upload.fields([{ name: 'profileImage' }, { name: 'coverPhoto' }]), async (req, res) => {
  const {
    corporateName,
    email,
    mobileNumber,
    alternateContactNumber,
    companyName,
    businessRegistrationNumber,
    taxIdentificationNumber,
    businessType,
    street,
    city,
    state,
    zipCode,
    country,
    tagline,
    address,
    overview,
    showSpecialties,
    showDoctors,
    showConditionLibrary,
    showReviews, 
    corporateSpecialties, 
  } = req.body;

  const updateData = {};

  // Only add fields to updateData if they are provided in the request
  if (corporateName) updateData.corporateName = corporateName;
  if (email) updateData.email = email;
  if (mobileNumber) updateData.mobileNumber = mobileNumber;
  if (alternateContactNumber) updateData.alternateContactNumber = alternateContactNumber;
  if (companyName) updateData.companyName = companyName;
  if (businessRegistrationNumber) updateData.businessRegistrationNumber = businessRegistrationNumber;
  if (taxIdentificationNumber) updateData.taxIdentificationNumber = taxIdentificationNumber;
  if (businessType) updateData.businessType = businessType;
  if (tagline) updateData.tagline = tagline;
  if (showSpecialties) updateData.showSpecialties = showSpecialties === 'true';
  if (showDoctors) updateData.showDoctors = showDoctors === 'true';
  if (showConditionLibrary) updateData.showConditionLibrary = showConditionLibrary === 'true';
  if (showReviews) updateData.showReviews = showReviews === 'true';
  if (corporateSpecialties) updateData.corporateSpecialties = corporateSpecialties ? corporateSpecialties : [] ;

  // Handle address if provided
  if (address) {
    try {
      updateData.address = JSON.parse(address);
    } catch (err) {
      console.error('Invalid JSON for address:', address);
      return res.status(400).json({ error: 'Invalid address format' });
    }
  }

  // Handle file uploads
  if (req.files && req.files['profileImage']) {
    updateData.profilePicture = {
      data: req.files['profileImage'][0].buffer,
      contentType: req.files['profileImage'][0].mimetype,
    };
  }

  if (req.files && req.files['coverPhoto']) {
    updateData.coverPhoto = {
      data: req.files['coverPhoto'][0].buffer,
      contentType: req.files['coverPhoto'][0].mimetype,
    };
  }

  try {
    // Update the user's profile with only the provided fields
    const updatedProfile = await Corporate.findByIdAndUpdate(req.session.user._id, updateData, { new: true });
    req.flash('success_msg', 'Profile updated successfully');
    res.status(200).json({ message: 'Profile updated successfully', updatedProfile });
  } catch (err) {
    console.error('Error updating profile:', err);
    req.flash('error_msg', 'Failed to update profile');
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/add-specialty', upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    const image = req.file;

    if (!name || !image) {
      return res.status(400).json({ message: 'Name and image are required.' });
    }

    const newSpecialty = {
      image: {
        data: image.buffer,
        contentType: image.mimetype,
      },
      name,
    };

    const corporate = await Corporate.findById(req.session?.user._id);

    corporate.corporateSpecialties.push(newSpecialty);
    await corporate.save();

    res.status(201).json({ message: 'Specialty added successfully.', data: specialtyDocument });
  } catch (error) {
    console.error('Error adding specialty:', error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/add-doctors', async (req, res) => {
  const searchEmail = req.query.email || '';

  try {
    const doctors = await Doctor.find({
      email: { $regex: searchEmail, $options: 'i' },
    });

    res.json({
      doctors,
      searchEmail,
    });
  } catch (err) {
    console.error('Error fetching doctors:', err);
    req.flash('error_msg', 'Error fetching doctors');
    res.redirect('/corporate/corporate-home');
  }
});

router.post('/add-doctor/:doctorId', async (req, res) => {
  const doctorId = req.params.doctorId;
  const corporateId = req.session.corporateId;

  try {
    const corporate = await Corporate.findById(corporateId);
    if (!corporate) {
      req.flash('error_msg', 'Corporate profile not found');
      return res.redirect('/corporate/corporate-home');
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      req.flash('error_msg', 'Doctor not found');
      return res.redirect('/corporate/corporate-home');
    }

    const existingRequest = doctor.corporateRequests.find(
      request => request.corporateId.toString() === corporateId.toString()
    );

    if (existingRequest) {
      req.flash('info_msg', 'Request has already been sent to this doctor');
      return res.redirect('/corporate/add-doctors');
    }

    doctor.corporateRequests.push({
      corporateId: corporate._id,
      corporateName: corporate.corporateName,
      requestStatus: 'pending',
    });
    doctor.faqs = doctor.faqs || [];

    doctor.faqs.push({
      question: 'What is your consultation fee?',
      answer: 'The consultation fee is $100.',
    });

    await doctor.save();

    req.flash('success_msg', 'Request has been sent to the doctor');
    res.redirect('/corporate/add-doctors');
  } catch (err) {
    console.error('Error sending corporate request to doctor:', err);
    req.flash('error_msg', 'Error sending request');
    res.redirect('/corporate/corporate-home');
  }
});

router.post('/update-doctor-review-visibility', async (req, res) => {
  try {
    const { reviewId, showOnPage } = req.body;

    const showOnPageBool = showOnPage === 'true';

    await Corporate.updateOne(
      { 'doctorReviews._id': reviewId },
      { $set: { 'doctorReviews.$.showOnPage': showOnPageBool } }
    );

    res.redirect('/corporate/profile');
  } catch (err) {
    console.error('Error updating doctor review visibility:', err);
    req.flash('error_msg', 'Error updating doctor review visibility');
    res.redirect('/corporate/profile');
  }
});

router.post('/update-patient-review-visibility', async (req, res) => {
  try {
    const { reviewId, showOnPage } = req.body;

    const showOnPageBool = showOnPage === 'true';

    await Corporate.updateOne(
      { 'patientReviews._id': reviewId },
      { $set: { 'patientReviews.$.showOnPage': showOnPageBool } }
    );

    res.redirect('/corporate/profile');
  } catch (err) {
    console.error('Error updating patient review visibility:', err);
    req.flash('error_msg', 'Error updating patient review visibility');
    res.redirect('/corporate/profile');
  }
});

router.get('/followers', async (req, res) => {
  try {
    const corporateId = req.session.corporateId;

    const corporate = await Corporate.findById(corporateId).populate({
      path: 'followers',
      select: 'name profilePicture',
    });

    if (!corporate) {
      req.flash('error_msg', 'Corporate profile not found');
      return res.redirect('/corporate/login');
    }

    res.render('followers', {
      followers: corporate.followers,
    });
  } catch (err) {
    console.error('Error fetching followers:', err);
    req.flash('error_msg', 'Error fetching followers');
    res.redirect('/corporate/corporate-home');
  }
});

router.get('/insights', async (req, res) => {
  try {
    // console.log("before try");
    const corporateId = req.session?.user._id;
    // console.log("after try",corporateId);

    if (!corporateId) {
      return res.status(400).json({ error: 'Corporate ID is required' });
    }

    const linkedDoctors = await Doctor.find({
      corporateRequests: {
        $elemMatch: {
          corporateId: corporateId,
          requestStatus: 'accepted'
        }
      }
    });

    const doctorIds = linkedDoctors.map(doctor => doctor._id);

    const totalDoctors = doctorIds.length;

    const totalPremiumDoctors = await Doctor.countDocuments({
      _id: { $in: doctorIds },
      subscriptionType: { $ne: 'Free' }
    });

    const totalPatients = await Booking.aggregate([
      {
        $match: {
          doctor: { $in: doctorIds }
        }
      },
      {
        $group: {
          _id: '$patient'
        }
      },
      {
        $count: 'uniquePatients'
      }
    ]).then(result => result[0]?.uniquePatients || 0);

    const totalBlogs = await Blog.countDocuments({
      authorId: { $in: doctorIds }
    });

    const blogsVerified = await Blog.countDocuments({
      authorId: { $in: doctorIds },
      verificationStatus: 'Verified'
    });

    const blogsPendingRequest = await Blog.countDocuments({
      authorId: { $in: doctorIds },
      verificationStatus: 'Pending'
    });

    const totalConsultations = await Booking.countDocuments({
      doctor: { $in: doctorIds },
      status: 'completed'
    });

    const totalReviews = await Doctor.aggregate([
      { $match: { _id: { $in: doctorIds } } },
      { $unwind: '$reviews' },
      { $count: 'totalReviews' }
    ]).then(result => result[0]?.totalReviews || 0);

    const bookingFilter = req.query['booking-filter'] || 'all';
    let startDate, endDate;

    switch (bookingFilter) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate = new Date('1970-01-01');
        endDate = new Date();
    }

    const bookingRates = await Booking.aggregate([
      {
        $match: {
          doctor: { $in: doctorIds },
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: '$date' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.json({
      totalDoctors,
      totalPremiumDoctors,
      totalPatients,
      totalBlogs,
      blogsVerified,
      blogsPendingRequest,
      totalConsultations,
      totalReviews,
      bookingRates,
      bookingFilter,
      corporateId,
      linkedDoctors
    });
  } catch (err) {
    console.error('Error fetching corporate insights:', err.message);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

const sendInvitationEmail = (email, inviteLink, hospitalName) => {
  const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
      },
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: `🏥 Invitation to Join ${hospitalName} Hospital Network`, 
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="text-align: center;">
          <span style="color: #FF7F50;">Join ${hospitalName} Network!</span>
        </h2>

        <p style="font-size: 16px;">Hello,</p>

        <p style="font-size: 16px;">We are thrilled to invite you to join the ${hospitalName} hospital network. Follow these simple steps to get started:</p>

        <h3 style="color: #272848;">Steps to Join:</h3>
        <ol style="font-size: 16px;">
          <li>If you are not a member yet, <a href=${process.env.REACT_APP_BASE_URL}/provider/signup style="color: #FF7F50; text-decoration: none;">register here</a> and complete your profile.</li>
          <li>If you are already a member, <a href=${process.env.REACT_APP_BASE_URL}/login style="color: #FF7F50; text-decoration: none;">log in here</a>.</li>
          <li>Once logged in, click the invitation link below to join:</li>
        </ol>

        <div style="text-align: center; margin: 20px 0;">
          <a href="${inviteLink}" style="padding: 14px 24px; color: white; background-color: #FF7F50; text-decoration: none; border-radius: 5px; font-size: 16px;">Join ${hospitalName} Now</a>
        </div>

        <p style="font-size: 16px;">Or, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; font-size: 16px;"><a href="${inviteLink}" style="color: #272848;">${inviteLink}</a></p>

        <p style="font-size: 16px;">We look forward to welcoming you to our network. If you have any questions, feel free to reach out—we're here to assist you!</p>

        <p style="font-size: 16px;">Best regards,</p>
        <p style="font-size: 16px;"><strong>The ${hospitalName} Team</strong></p>

        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">

        <p style="font-size: 14px; color: #777;">P.S. If you did not expect this invitation, please disregard this email.</p>
      </div>
    `,
  };

  return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
              reject(error);
          } else {
              resolve(info);
          }
      });
  });
};
router.post('/send-invite', async (req, res) => {
  const {email, inviteLink } = req.body;
  
  const corporateId = req.session?.user?._id;

  if (!email || !inviteLink || !corporateId) {
    return res.status(400).json({ message: 'Email, invite link, and corporate ID are required' });
  }

  try {
    const corporate = await Corporate.findById(corporateId);
    if (!corporate) {
      return res.status(404).json({ message: 'Corporate not found' });
    }

    const hospitalName = corporate.corporateName;
    const info = await sendInvitationEmail(email, inviteLink, hospitalName);

    return res.status(200).json({ message: 'Invitation sent successfully', info });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: 'Error sending email', error });
  }
});

router.get('/corporate-list', async (req, res) => {
  const { 
    state, 
    country, 
    city, 
    treatmentApproach, 
    corporateName, 
    doctorLanguage, 
    speciality, 
    condition 
  } = req.query; 

  const filter = { verificationStatus: 'Verified' }; 

  if (state) filter['address.state'] = state;
  if (country) filter['address.country'] = country;
  if (city) filter['address.city'] = city;
  if (corporateName) filter['corporateName'] = { $regex: corporateName, $options: 'i' };

  try {
    const corporates = await Corporate.find(filter)
      .select('corporateName tagline address profilePicture slug')
      .populate({
        path: 'doctors',
        match: {
          ...(treatmentApproach && { treatmentApproach: { $in: [treatmentApproach] } }),
          ...(doctorLanguage && { languages: { $in: [doctorLanguage] } }),
          ...(speciality && { speciality: { $in: [speciality] } }), 
          ...(condition && { conditions: { $in: [condition] } }),  
        },
        select: 'speciality conditions treatmentApproach languages',
      })
      .lean();

    const filteredCorporates = corporates.filter(corporate => corporate.doctors && corporate.doctors.length > 0);

    const states = await Corporate.distinct('address.state', { verificationStatus: 'Verified' });
    const countries = await Corporate.distinct('address.country', { verificationStatus: 'Verified' });
    const cities = await Corporate.distinct('address.city', { verificationStatus: 'Verified' });
    const treatmentApproaches = await Doctor.distinct('treatmentApproach');
    const languagesSpoken = await Doctor.distinct('languages');
    const specialities = await Doctor.distinct('speciality'); 
    const conditions = await Doctor.distinct('conditions');

    res.json({
      corporates: filteredCorporates,
      states,
      countries,
      cities,
      treatmentApproaches,
      languagesSpoken,
      specialities, 
      conditions, 
      selectedFilters: { 
        state, 
        country, 
        city, 
        treatmentApproach, 
        corporateName, 
        doctorLanguage, 
        speciality, 
        condition 
      },
    });
  } catch (err) {
    console.error('Error fetching corporate list:', err);
    req.flash('error_msg', 'Error retrieving corporate list');
    res.redirect('/patient/patient-index');
  }
});


router.post('/claim-profile', upload.single('document'), async (req, res) => {
  const { corporateId, email } = req.body;
  const document = req.file;

  try {
    const corporate = await Corporate.findById(corporateId);
    if (!corporate) {
      return res.status(404).send('Corporate profile not found.');
    }

    if (!document || !email) {
      return res.status(400).send('Email and document are required.');
    }

    corporate.profileTransferRequest = 'Pending';

    corporate.profileVerification.push({
      email,
      document: {
        data: document.buffer,
        contentType: document.mimetype,
      },
    });

    await corporate.save();

    return res.status(200).json({ message: 'Claim profile submitted successfully' });
  } catch (err) {
    console.error('Error submitting claim:', err);
    res.status(500).send('Internal server error.');
  }
});


router.get('/:corporateId/doctors', async (req, res) => {
  try {
    const { corporateId } = req.params;
    // Check if the logged-in corporate matches the requested corporate    
    if (req.session.user?._id !== corporateId) {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/corporate/login');
    }

    // Fetch corporate and its associated doctors
    const corporate = await Corporate.findById(corporateId).populate('doctors');

    if (!corporate) {
      req.flash('error_msg', 'Corporate not found');
      return res.redirect('/corporate/login');
    }

    res.json({
      corporate,
      doctors: corporate.doctors,
      followerCount: corporate.followers.length,
    });

  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error');
    res.redirect('/corporate/dashboard');
  }
});
router.get('/doctor/insights/:doctorId', async (req, res) => {
  try {
    const doctorId = req.params.doctorId;

    // Fetch doctor details
    const doctor = await Doctor.findById(doctorId).populate('reviews');

    if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
    }

    // Get unique patient count
    const totalPatients = await Booking.aggregate([
        { $match: { doctor: doctor._id, status: 'completed' } },
        { $group: { _id: "$patient" } },
        { $count: "uniquePatients" }
    ]);

    // Total consultations completed
    const totalConsultations = await Booking.countDocuments({ doctor: doctor._id, status: 'completed' });

    // Total reviews and average rating
    const totalReviews = doctor.reviews.length;
    const totalRatings = doctor.reviews.reduce((acc, review) => acc + review.rating, 0);
    const averageRating = totalReviews > 0 ? (totalRatings / totalReviews).toFixed(1) : 'No ratings';

    const bookingFilter = req.query['booking-filter'] || 'all';
    const insightsFilter = req.query['insight-filter'] || 'all';

    let startDate, endDate;
    const currentDate = new Date();

    if (bookingFilter === 'today') {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
    } else if (bookingFilter === 'week') {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay());
        endDate = new Date();
        endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
    } else if (bookingFilter === 'month') {
        startDate = new Date();
        startDate.setDate(1);
        endDate = new Date(startDate);
        endDate.setMonth(endDate.getMonth() + 1);
        endDate.setDate(0);
    } else {
        startDate = new Date('1970-01-01');
        endDate = new Date();
    }

    // Booking rates grouped by day of the week
    const bookingRates = await Booking.aggregate([
        { $match: { doctor: doctor._id, date: { $gte: startDate, $lte: endDate } } },
        {
            $group: {
                _id: { $dayOfWeek: '$date' },
                count: { $sum: 1 }
            }
        },
        { $sort: { _id: 1 } }
    ]);

    // Total unread messages
    const unreadMessages = await Chat.aggregate([
        { $match: { doctorId: doctor._id } },
        { $unwind: '$messages' },
        { $match: { 'messages.read': false, 'messages.senderId': { $ne: doctor._id } } },
        { $count: 'unreadCount' }
    ]);

    const totalUnreadMessages = unreadMessages.length > 0 ? unreadMessages[0].unreadCount : 0;

    // Total waiting appointments
    const waitingAppointmentsCount = await Booking.countDocuments({
        doctor: doctor._id,
        status: 'waiting'
    });

    // Time slots
    const totalPostedSlots = doctor.timeSlots.length;
    const totalFilledSlots = doctor.timeSlots.filter(slot => slot.status === 'booked').length;

    // Calculate income over the last 5 months
    const incomeByMonth = Array(5).fill(0);

    for (let i = 0; i < 5; i++) {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - i + 1, 0);

        const monthlyIncome = await Booking.aggregate([
            { $match: { doctor: doctor._id, status: 'completed', paid: true, date: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: null, total: { $sum: '$payment' } } }
        ]);

        incomeByMonth[4 - i] = monthlyIncome.length > 0 ? monthlyIncome[0].total : 0;
    }

    const totalIncomeReceived = incomeByMonth.reduce((acc, income) => acc + income, 0);

    // Render template with insights data
    res.json({
        doctor,
        insights: {
            totalPatients: totalPatients.length > 0 ? totalPatients[0].uniquePatients : 0,
            totalConsultations,
            totalReviews,
            averageRating,
            waitingAppointmentsCount,
            totalUnreadMessages,
            totalPostedSlots,
            totalFilledSlots,
            totalIncomeReceived,
            incomeByMonth,
            
            
        },insightsFilter, bookingFilter, bookingRates
    });

} catch (error) {
    console.error("Error fetching doctor insights:", error);
    res.status(500).json({ message: "Internal server error" });
}
});
router.get('/doctor/bookings/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { searchQuery, filterDate, filterStatus, filterConsultation } = req.query;

    let query = { doctor: doctorId };

    // Filter by search query for patient name or hospital name
    if (searchQuery) {
      query.$or = [
        { patient: { $exists: true } }, // Ensure patient exists
        { hospital: { $exists: true } } // Ensure hospital exists
      ];
    }

    // Filter by booking date
    if (filterDate) {
      query.date = filterDate;
    }

    // Filter by status
    if (filterStatus) {
      query.status = filterStatus.toLowerCase();
    }

    // Filter by consultation type
    if (filterConsultation) {
      query.consultationType = filterConsultation;
    }

    
    // Fetch bookings with populated patient and hospital
    const bookings = await Booking.find(query)
      .populate('patient', 'name') // Populate only the 'name' field of patient
      .populate('hospital', 'name'); // Populate only the 'name' field of hospital

    // Apply text search after population (since MongoDB regex doesn't work on populated fields)
    if (searchQuery) {
      const filteredBookings = bookings.filter(
        (booking) =>
          (booking.patient?.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (booking.hospital?.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      return res.json({
        bookings: filteredBookings,
        doctorId,
        searchQuery,
        filterDate,
        filterStatus,
        filterConsultation,
      });
    }

    res.json({
      bookings,
      doctorId,
      searchQuery,
      filterDate,
      filterStatus,
      filterConsultation,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});
router.post('/remove-doctor/:doctorId', isLoggedIn, async (req, res) => {
  try {
    const corporateId = req.session.user?._id;

    // Check if the logged-in user is a corporate
    if (req.session.user?._id !== corporateId) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { doctorId } = req.params;

    // Remove doctor from the corporate's doctors list
    const updateResult = await Corporate.updateOne(
      { _id: corporateId },
      { $pull: { doctors: doctorId } }
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(404).json({ success: false, message: 'Doctor not found or not associated with this corporate' });
    }

    return res.status(200).json({ success: true, message: 'Doctor removed successfully' });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});
router.get('/corporate/doctor-patients/:doctorId', isLoggedIn, async (req, res) => {
  try {
    const corporateId = req.session.user?._id;
    const { doctorId } = req.params;

    // Ensure only corporates can access this route
    if (!corporateId) {
      return res.status(403).send('Unauthorized');
    }

    // Find completed bookings for the doctor
    const completedBookings = await Booking.find({ doctor: doctorId, status: 'completed' })
      .populate('patient')
      .populate('doctor');

    res.json({completedBookings, doctorId });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.get('/create-account', isCorporate, (req, res) => {
  res.render('corporateCreateAccount', {
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg'),
    activePage: 'create-account', 
  });
});

router.post('/create-account', isCorporate, async (req, res) => {  
  const { name, email, password } = req.body;
  const corporateId = req.session.user?._id; // Get corporate ID from session

  try {
    if (!name || !email || !password) {
      req.flash('error_msg', 'All fields are required.');
      return res.redirect('/corporate/create-account');
    }

    // Check if the email already exists in the database
    const existingDoctor = await Doctor.findOne({ email });
    if (existingDoctor) {
      req.flash('error_msg', 'Account email is already created.');
      return res.redirect('/corporate/create-account');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // Get corporate details
    const corporate = await Corporate.findById(corporateId);
    if (!corporate) {
      req.flash('error_msg', 'Corporate account not found.');
      return res.redirect('/corporate/create-account');
    }

    // Handle corporate address as a single object
    const hospital = {
      name: corporate.corporateName, // Example: use company name as hospital name
      street: corporate.address.street,
      city: corporate.address.city,
      state: corporate.address.state,
      country: corporate.address.country,
      zip: corporate.address.zipCode
    };

    // Create a new doctor account
    const newDoctor = new Doctor({
      name,
      email,
      password: hashedPassword,
      role: 'doctor',
      hospitals: [hospital], // Adding the hospital as an array
      createdByCorporate: true,
      verified: "Verified",
      isVerified: true
    });

    await newDoctor.save();

    // Add corporate request to the doctor's corporateRequests field
    if (!corporate.doctors.includes(newDoctor._id)) {
      corporate.doctors.push(newDoctor._id);
      await corporate.save();
  }
    newDoctor.corporateRequests.push({
      corporateId: corporate._id,
      corporateName: corporate.corporateName,
      requestStatus: "accepted"
    });

    // Save the doctor document again after updating corporateRequests
    await newDoctor.save();

    return res.status(201).json({ success: true, message: 'Doctor account created successfully.', doctor: newDoctor });

  } catch (err) {
    console.error('Error creating doctor account:', err);
    req.flash('error_msg', 'An error occurred while creating the account.');
    res.redirect('/corporate/create-account');
  }
});


router.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).send("Failed to log out.");
    }
    res.redirect('/corporate/login');
  });
});




module.exports = router;
