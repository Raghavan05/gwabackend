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

const router = express.Router();

router.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

router.use(flash());

router.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

const sendOTP = async (email, otp) => {
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
    subject: 'Verification OTP for Signup',
    text: `Your OTP for signup is: ${otp}`
  };

  await transporter.sendMail(mailOptions);
};
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



  const verificationLink = `${process.env.NODE_URL}/auth/verify-email?token=${token}&role=${role}`;

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


router.get('/signup/patient', (req, res) => {
  const showOtpForm = req.session.newUser && req.session.newUser.otp;
  res.render('signup_patient', { showOtpForm });
});

router.post('/signup/patient', async (req, res) => {
  const { name, email, password, phoneNumber } = req.body;

  try {
    let existingUser = await Patient.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const token = generateVerificationToken();
    await sendVerificationEmail(name, email, token, 'patient');

    const hashedPassword = await bcrypt.hash(password, 10);
    const newPatient = new Patient({
      name,
      email,
      password: hashedPassword,
      phoneNumber,
      verificationToken: token
    });

    await newPatient.save();

    return res.status(200).json({ success: 'Verification email has been sent to your email. Please verify.' });
  } catch (err) {
    console.error('Error in patient signup:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/signup/doctor', (req, res) => {
  const showOtpForm = req.session.newUser && req.session.newUser.otp;
  res.render('signup_doctor', { showOtpForm });
});


router.post('/signup/doctor', async (req, res) => {
  const { name, email, password, phoneNumber } = req.body;

  try {
    let existingUser = await Doctor.findOne({ email });

    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const token = generateVerificationToken();
    await sendVerificationEmail(name, email, token, 'doctor');
    const hashedPassword = await bcrypt.hash(password, 10);
    const newDoctor = new Doctor({
      name,
      email,
      password: hashedPassword,
      phoneNumber,
      verificationToken: token
    });

    await newDoctor.save();

    return res.status(200).json({ success: 'Verification email has been sent to your email. Please verify.' });
  } catch (err) {
    console.error('Error in doctor signup:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

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
    subject: '🎉 Welcome to MedxBay! 🎉',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="color: #FF7F50; text-align: center;">🎉 Welcome to MedxBay! 🎉</h2>
        
        <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
  
        <p style="font-size: 16px;">Congratulations! Your email has been successfully verified, and we are delighted to welcome you to the MedxBay family!</p>
  
        <p style="font-size: 16px;">Now that you're all set, you can start exploring our platform. Whether you're a user looking for top-notch medical care or a provider ready to offer your expertise, we are here to support you every step of the way.</p>
  
        <p style="font-size: 16px;">If you have any questions, our support team is always here to help. We're excited to see you thrive on MedxBay!</p>
  
        <p style="font-size: 16px; text-align: center;"><strong>Welcome aboard!</strong></p>
  
        <p style="font-size: 16px;">Best regards,</p>
        <p style="font-size: 16px;"><strong>The MedxBay Team</strong></p>
  
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  
        <p style="font-size: 14px; color: #777;">If you have any issues, feel free to contact our support team.</p>
      </div>
    `
  };  

  await transporter.sendMail(mailOptions);
};

router.get('/verify-email', async (req, res) => {
  const { token, role } = req.query;

  console.log('Received token:', token, 'and role:', role);

  try {
      let user;

      if (role === 'patient') {
          user = await Patient.findOne({ verificationToken: token });
      } else if (role === 'doctor') {
          user = await Doctor.findOne({ verificationToken: token });
      }

      if (!user) {
          console.log(`User not found with token: ${token} and role: ${role}`);
          return res.redirect(`${process.env.REACT_URL}`);
      }

      if (user.isVerified) {
          console.log(`User with token: ${token} is already verified.`);
          return res.redirect(`${process.env.REACT_URL}`);
      }

      user.isVerified = true;
      user.verificationToken = undefined;
      await user.save();

      console.log(`User verified successfully: ${user._id}`);

      await sendWelcomeEmail(user.name, user.email, role);

      return res.redirect(`${process.env.REACT_URL}/verify/login`);
  } catch (err) {
      console.error('Error in email verification:', err);
      return res.redirect(`${process.env.REACT_URL}`);
  }
});


router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await Patient.findOne({ email }) ||
               await Doctor.findOne({ email }) ||
               await Admin.findOne({ email });

    if (!user) {
      return res.status(401).json({ success: false, message: 'User does not exist' });
    }

    if (!user.isVerified) {
      return res.status(401).json({ success: false, message: 'Please verify your email before logging in.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Password is incorrect' });
    }

    req.session.user = {
      _id: user._id,
      email: user.email,
      role: user.role,
      trialEndDate: user.trialEndDate,
      subscriptionType: user.subscriptionType,
      subscriptionVerification: user.subscriptionVerification
    };
    console.log('Session data after login:', req.session);
    return res.status(200).json({ success: true, message: 'Login successful', user });
  } catch (err) {
    console.error('Error in login:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});



const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

router.get('/google/patient', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    state: JSON.stringify({ role: 'patient' }) 
  });
  res.redirect(authUrl);
});

router.get('/google/doctor', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    state: JSON.stringify({ role: 'doctor' }) 
  });
  res.redirect(authUrl);
});

router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent', 
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });

    const { data } = await oauth2.userinfo.get();
    const { name, email } = data;

    let existingUser = await Patient.findOne({ email })
                      || await Doctor.findOne({ email })
                      || await Admin.findOne({ email });

    let newUser;
    if (existingUser) {
      req.session.user = existingUser;
      const userRole = existingUser.role;
      const userId = existingUser._id;
      const redirectUrl = userRole === 'doctor'
        ? `${process.env.REACT_URL}/doctorprofile/dashboardpage/start-dashboard?role=${userRole}&name=${name}&id=${userId}&email=${email}`
        : `${process.env.REACT_URL}/profile/userprofile?role=${userRole}&name=${name}&id=${userId}&email=${email}`;
      res.redirect(redirectUrl);
    } else {
      const role = JSON.parse(state).role;

      if (role === 'patient') {
        newUser = new Patient({
          name,
          email,
          role: 'patient',
        });
      } else if (role === 'doctor') {
        newUser = new Doctor({
          name,
          email,
          role: 'doctor',
        });
      } else {
        return res.status(400).json({ success: false, message: 'Invalid role' });
      }

      const salt = await bcrypt.genSalt(10);
      newUser.password = await bcrypt.hash(email, salt); 

      await newUser.save();

      req.session.user = newUser;
      const userId = newUser._id;
      const redirectUrl = role === 'doctor'
        ? `${process.env.REACT_URL}/doctorprofile/dashboardpage/start-dashboard?role=${role}&name=${name}&id=${userId}&email=${email}`
        : `${process.env.REACT_URL}/profile/userprofile?role=${role}&name=${name}&id=${userId}&email=${email}`;
      res.redirect(redirectUrl);
    }
  } catch (err) {
    console.error('Error in Google OAuth callback:', err);
    res.status(500).json({ success: false, message: 'Authentication failed. Please try again.' });
  }
});

router.get('/logout', (req, res) => {
  req.flash('success_msg', 'Logged out successfully');
  req.session.destroy(err => {
    if (err) {
      console.error('Error in session destruction:', err);
      req.flash('error_msg', 'Error logging out');
      return res.redirect('/');
    }

    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
});

router.get('/exit', (req, res) => {
  req.flash('success_msg', 'Exited successfully');
  req.session.destroy(err => {
    if (err) {
      console.error('Error in session destruction:', err);
      req.flash('error_msg', 'Error exiting');
      return res.redirect('/auth/signup');
    }

    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
});




router.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    let user = await Patient.findOne({ email }) ||
               await Doctor.findOne({ email }) ||
               await Admin.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = Date.now() + 3600000; // 1 hour

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;

    await user.save();


    const resetUrl = `${process.env.REACT_URL}/reset-password?token=${resetToken}`;

    // const resetUrl = `http://localhost:8000/reset-password?token=${resetToken}`;

    await sendResetPasswordEmail(user.email, user.name, resetUrl);

    return res.json({ success: true, message: 'A password reset link has been sent to your email.' });
  } catch (err) {
    console.error('Error in forgot password:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});


const generateResetToken = () => {
  return crypto.randomBytes(20).toString('hex');
};

const sendResetPasswordEmail = async (email, name,resetUrl) => {
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
    subject: '🔒 Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="color: #272848; text-align: center;">🔒 Password Reset Request</h2>
        
        <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
  
        <p style="font-size: 16px;">We received a request to reset your password. If you did not request this, please ignore this email.</p>
  
        <p style="font-size: 16px;">To reset your password, click the button below:</p>
  
        <div style="text-align: center; margin: 20px 0;">
          <a href="${resetUrl}" style="padding: 14px 24px; color: white; background-color: #FF7F50; text-decoration: none; border-radius: 5px; font-size: 16px;">Reset Your Password</a>
        </div>
  
        <p style="font-size: 16px;">If the button doesn't work, copy and paste the following link into your browser:</p>
        <p style="word-break: break-all; font-size: 16px;"><a href="${resetUrl}" style="color: #272848;">${resetUrl}</a></p>
  
        <p style="font-size: 16px;">For security purposes, this link will expire in 60 minutes.</p>
  
        <p style="font-size: 16px;">Best regards,</p>
        <p style="font-size: 16px;"><strong>The MedxBay Team</strong></p>
  
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  
        <p style="font-size: 14px; color: #777;">If you didn't request a password reset, please ignore this email. Your account remains safe.</p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    let user = await Patient.findOne({ email }) ||
               await Doctor.findOne({ email }) ||
               await Admin.findOne({ email });

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/forgot-password');
    }

    const token = generateResetToken();
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; 

    await user.save();

    await sendResetEmail(email, token);

    req.flash('success_msg', 'Reset link has been sent to your email.');
    return res.redirect('/auth/forgot-password');
  } catch (err) {
    console.error('Error in forgot password:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/forgot-password');
  }
});

router.get('/reset-password', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });
  }

  try {
    let user = await Patient.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }) ||
               await Doctor.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }) ||
               await Admin.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });
    }

    res.render('reset-password', { token });
  } catch (err) {
    console.error('Error in reset password:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});
router.post('/reset-password', async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  console.log('Received data:', { token, newPassword, confirmPassword });

  if (!token || !newPassword || !confirmPassword) {
    return res.status(400).json({ success: false, message: 'Please fill all fields' });
  }

  if (newPassword !== confirmPassword) {
    return res.status(400).json({ success: false, message: 'Passwords do not match' });
  }

  try {
    let user = await Patient.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }) ||
               await Doctor.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }) ||
               await Admin.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired password reset token' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    return res.json({ success: true, message: 'Password reset successful. Please login with your new password.' });
  } catch (err) {
    console.error('Error in reset password:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});



module.exports = router;