const express = require('express');
const router = express.Router();
const multer = require('multer');
const moment = require('moment');
const methodOverride = require('method-override');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Blog = require('../models/Blog');
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin');
const Booking = require('../models/Booking');
const Chat = require('../models/Chat');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Notification = require('../models/Notification');
const Insurance = require('../models/Insurance');
const Specialty = require('../models/Specialty');
const Condition = require('../models/Condition');
const Corporate = require('../models/Corporate');

require('dotenv').config();

console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD);


const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


router.use(methodOverride('_method'));

function isLoggedIn(req, res, next) {
    if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
    } else {
        res.status(401).json({ success: false, message: 'Unauthorized access attempt.' });
    }
}



function checkSubscription(req, res, next) {
    const user = req.session.user;
    const currentDate = new Date();


    if (user.subscriptionVerification === 'Verified') {
        if (user.subscriptionType === 'Free') {
            if (user.trialEndDate && currentDate <= new Date(user.trialEndDate)) {
                return next();
            } else {
                return res.json('/doctor/trial-expired');
            }
        } else if (user.subscriptionType === 'Premium' || user.subscriptionType === 'Standard') {
            return next();
        }
    }
    res.json('/doctor/subscription-message');
}

function isDoctor(req, res, next) {
    if (req.session.user && req.session.user.role === 'doctor') {
        return next();
    }
    res.redirect('/auth/login');
}

router.get('/doctor-index', isDoctor, isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;

        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }
        const blogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).limit(5).exec();

        res.render('doctor-index', { doctor, blogs, user: req.session.user });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/profile', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        console.log('Doctor email from session:', doctorEmail);  // Debugging log

        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }
        res.json({ doctor });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/edit', isLoggedIn, async (req, res) => {
    try {
        if (!req.session.user || !req.session.user.email) {
            return res.status(401).json({ error: 'Unauthorized access' });
        }

        const doctorEmail = req.session.user.email;
        console.log('Doctor email from session in edit route:', doctorEmail);

        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
        if (!doctor) {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        if (!doctor.hospitals) {
            doctor.hospitals = [];
        }

        res.json(doctor);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.get('/profile/update', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
        if (!doctor) return res.status(404).send('Doctor not found');

        const allInsurances = await Insurance.find({}).select('_id name logo');
        const insurances = await Insurance.find({ '_id': { $in: doctor.insurances } }).select('_id name logo');

        const allSpecialties = await Specialty.find({}).select('_id name');
        const allConditions = await Condition.find({}).select('_id name');

        const faqs = doctor.faqs || [];
        while (faqs.length < 4) {
            faqs.push({ question: '', answer: '' });
        }

        res.json({
            doctor,
            insurances,
            allInsurances,
            allSpecialties,
            allConditions,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});
router.post('/profile/upload-cover', upload.single('coverPhoto'), isLoggedIn, async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('No file uploaded.');
        }

        if (!req.file.mimetype.startsWith('image')) {
            return res.status(400).send('Invalid file type. Please upload an image.');
        }

        const doctorId = req.session.user._id;

        const updatedDoctor = await Doctor.findByIdAndUpdate(
            doctorId, 
            {
                coverPhoto: {
                    data: req.file.buffer,
                    contentType: req.file.mimetype
                }
            },
            { new: true }
        );

        if (!updatedDoctor) {
            return res.status(404).send('Doctor not found.');
        }

        res.redirect('/doctor/profile');
        
    } catch (error) {
        console.error("Error uploading cover photo:", error); 
        res.status(500).send('Error uploading cover photo');
    }
});
router.post('/profile/update', isLoggedIn, async (req, res) => {
    try {

        const doctorEmail = req.session.user.email;
        let doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).json({ success: false, message: 'Doctor not found' });
        }

        const updateData = {};

        // Profile Picture
        if (req.body.profilePicture) {
            updateData.profilePicture = {
                data: Buffer.from(req.body.profilePicture.data, 'base64'),
                contentType: req.body.profilePicture.contentType,
            };
        }


        // License Proof
        if (req.body.documents.licenseProof) {
            updateData.documents = updateData.documents || {};
            updateData.documents.licenseProof = {
                data: Buffer.from(req.body.documents.licenseProof.data, 'base64'),
                contentType: req.body.documents.licenseProof.contentType,
            };
        }

        // Certification Proof
        if (req.body.documents.certificationProof) {
            updateData.documents = updateData.documents || {};
            updateData.documents.certificationProof = {
                data: Buffer.from(req.body.documents.certificationProof.data, 'base64'),
                contentType: req.body.documents.certificationProof.contentType,
            };
        }

        // Business Proof
        if (req.body.documents.businessProof) {
            updateData.documents = updateData.documents || {};
            updateData.documents.businessProof = {
                data: Buffer.from(req.body.documents.businessProof.data, 'base64'),
                contentType: req.body.documents.businessProof.contentType,
            };
        }


        if (req.body.name) updateData.name = req.body.name;
        if (req.body.title) updateData.title = req.body.title;
        if (req.body.zip) updateData.zip = req.body.zip

        if (req.body.licenseNumber) updateData.licenseNumber = req.body.licenseNumber

        if (req.body.aboutMe) updateData.aboutMe = req.body.aboutMe;
        if (req.body.dateOfBirth) updateData.dateOfBirth = req.body.dateOfBirth;
        if (req.body.gender) updateData.gender = req.body.gender;
        if (req.body.country) updateData.country = req.body.country;
        if (req.body.state) updateData.state = req.body.state;
        if (req.body.city) updateData.city = req.body.city;
        if (req.body.availability) updateData.availability = req.body.availability;
        if (req.body.consultation) updateData.consultation = req.body.consultation;
        if (req.body.facebook) updateData.facebook = req.body.facebook;
        if (req.body.twitter) updateData.twitter = req.body.twitter;
        if (req.body.instagram) updateData.instagram = req.body.instagram;
        if (req.body.linkedin) updateData.linkedin = req.body.linkedin;
        if (req.body.specialization) updateData.specialization = req.body.specialization;
        if (req.body.termsAndConditionsAccepted !== undefined) updateData.termsAndConditionsAccepted = req.body.termsAndConditionsAccepted;
        if (req.body.showAwards !== undefined) updateData.showAwards = req.body.showAwards;
        if (req.body.showFaq !== undefined) updateData.showFaq = req.body.showFaq;
        if (req.body.showArticle !== undefined) updateData.showArticle = req.body.showArticle;
        if (req.body.showInsurances !== undefined) updateData.showInsurances = req.body.showInsurances;
        
        if (req.body.conditions) {
            updateData.conditions = Array.isArray(req.body.conditions) ? req.body.conditions : [req.body.conditions];
        }
        if (req.body.speciality) {
            updateData.speciality = Array.isArray(req.body.speciality) ? req.body.speciality : [req.body.speciality];
        }
        if (req.body.languages) {
            updateData.languages = Array.isArray(req.body.languages) ? req.body.languages : [req.body.languages];
        }
        if (req.body.insurances) {
            const insuranceIds = (Array.isArray(req.body.insurances) ? req.body.insurances : [req.body.insurances])
            .map(id => id.toString());
            updateData.insurances = Array.from(insuranceIds);
        }

        if (req.body.awards) {
            updateData.awards = Array.isArray(req.body.awards) ? req.body.awards : [req.body.awards];
        }

        if (req.body.faqs) {
            let faqs = [];

            if (Array.isArray(req.body.faqs)) {

                faqs = req.body.faqs.slice(0, 4).map((faq) => ({
                    question: faq.question,
                    answer: faq.answer
                }));
            } else if (req.body.faqs && req.body.faqs.question) {
                faqs = [{
                    question: req.body.faqs.question,
                    answer: req.body.faqs.answer
                }];
            }

            updateData.faqs = faqs;
        }


        if (req.body.hospitals) {
            let hospitals = [];
            if (Array.isArray(req.body.hospitals)) {
                hospitals = req.body.hospitals.map(hospital => ({
                    name: hospital.name,
                    street: hospital.street,
                    city: hospital.city,
                    state: hospital.state,
                    country: hospital.country,
                    zip: hospital.zip,
                    lat: hospital.lat && !isNaN(parseFloat(hospital.lat)) ? parseFloat(hospital.lat) : undefined,
                    lng: hospital.lng && !isNaN(parseFloat(hospital.lng)) ? parseFloat(hospital.lng) : undefined
                }));
            } else if (req.body.hospitals && req.body.hospitals.name) {
                hospitals = [{
                    name: req.body.hospitals.name,
                    street: req.body.hospitals.street,
                    city: req.body.hospitals.city,
                    state: req.body.hospitals.state,
                    country: req.body.hospitals.country,
                    zip: req.body.hospitals.zip,
                    lat: req.body.hospitals.lat && !isNaN(parseFloat(req.body.hospitals.lat)) ? parseFloat(req.body.hospitals.lat) : undefined,
                    lng: req.body.hospitals.lng && !isNaN(parseFloat(req.body.hospitals.lng)) ? parseFloat(req.body.hospitals.lng) : undefined
                }];
            }
            updateData.hospitals = hospitals;
        }
        if (req.body.doctorFee) {
            updateData.doctorFee = parseFloat(req.body.doctorFee);
        }
        if (req.body.treatmentApproach) {
            updateData.treatmentApproach = req.body.treatmentApproach;

        }
        if(req.body.termsAndConditionsAccepted){
            
        }


        doctor = await Doctor.findOneAndUpdate(
            { email: doctorEmail },
            { $set: updateData },
            { new: true, runValidators: true }
        );

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (err) {
        console.error('Error updating profile:', err.message);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

router.post('/profile/verify', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        let doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        doctor.verified = 'Pending';
        await doctor.save();

        return res.status(200).json({
            message: 'Verification request sent. You will be notified once verified.'
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ message: 'Server Error' });
    }
});


router.get('/bookings', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const bookings = await Booking.find({ doctor: req.session.user._id }).populate('patient');

        if (req.accepts('html')) {
            res.render('doctorBookings', { bookings });
        } else if (req.accepts('json')) {
            res.json({ bookings });
        } else {
            res.status(406).send('Not Acceptable');
        }
    } catch (error) {
        console.error(error.message);
        if (req.accepts('html')) {
            res.status(500).send('Server Error');
        } else if (req.accepts('json')) {
            res.status(500).json({ error: 'Server Error' });
        }
    }
});





async function createGoogleCalendarEvent(booking) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = {
        summary: `Appointment with Dr. ${booking.doctor.name}`,
        description: `Appointment with Dr. ${booking.doctor.name} and patient ${booking.patient.name}`,
        start: {
            dateTime: booking.date.toISOString(),
            timeZone: 'America/Los_Angeles',
        },
        end: {
            dateTime: new Date(booking.date.getTime() + 30 * 60000).toISOString(),
            timeZone: 'America/Los_Angeles',
        },
        attendees: [
            { email: booking.doctor.email },
            { email: booking.patient.email },
        ],
        location: booking.consultationType === 'In-person' ? `${booking.hospital.name}, ${booking.hospital.location.street}, ${booking.hospital.location.city}` : undefined,
        conferenceData: booking.consultationType === 'Video call' ? {
            createRequest: {
                requestId: 'some-random-string',
                conferenceSolutionKey: {
                    type: 'hangoutsMeet'
                }
            }
        } : undefined,
        guestsCanModify: true,
        guestsCanInviteOthers: true,
        guestsCanSeeOtherGuests: true,
    };

    try {
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: booking.consultationType === 'Video call' ? 1 : undefined,
        });

        return booking.consultationType === 'Video call' ? response.data.hangoutLink : response.data.htmlLink;
    } catch (error) {
        console.error('Error creating Google Calendar event:', error);
        throw new Error('Unable to create calendar event');
    }
}



router.post('/bookings/:id', isLoggedIn, async (req, res) => {
    try {
        const { status } = req.body;
        const bookingId = req.params.id;

        const booking = await Booking.findById(bookingId)
            .populate('doctor')
            .populate('patient')
            .populate('hospital');

        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        const currentStatus = booking.status;

        const now = moment();

        const bookingDate = moment(booking.date);
        const bookingTimeStart = moment(booking.time.split(' - ')[0], 'HH:mm');
        const bookingTimeEnd = moment(booking.time.split(' - ')[1], 'HH:mm');

        const bookingStartDateTime = moment(bookingDate).set({
            hour: bookingTimeStart.get('hour'),
            minute: bookingTimeStart.get('minute')
        });

        const bookingEndDateTime = moment(bookingDate).set({
            hour: bookingTimeEnd.get('hour'),
            minute: bookingTimeEnd.get('minute')
        });

        if (now.isAfter(bookingEndDateTime)) {
            booking.status = 'completed';
        } else {
            booking.status = status;
        }

        if (status === 'accepted' && !booking.meetingLink) {
            booking.meetingLink = await createGoogleCalendarEvent(booking);
        }

        await booking.save();

        const doctor = booking.doctor;

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        const timeSlotIndex = doctor.timeSlots.findIndex(slot =>
            slot.date.toISOString() === booking.date.toISOString() &&
            slot.startTime === booking.time.split(' - ')[0]
        );

        if (timeSlotIndex !== -1) {
            if (currentStatus === 'rejected' && (status === 'waiting' || status === 'accepted')) {
                doctor.timeSlots[timeSlotIndex].status = 'booked';
            } else if (status === 'rejected') {
                doctor.timeSlots[timeSlotIndex].status = 'free';
            } else {
                doctor.timeSlots[timeSlotIndex].status = 'booked';
            }

            await doctor.save();

            let emailSubject, emailContent, chatMessage;

            if (status === 'accepted') {
                if (booking.consultationType === 'Video call') {
                    emailSubject = 'Appointment Confirmation';
                    emailContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
                                        <h2 style="color: #FF7F50; text-align: center;">Appointment Confirmation</h2>
                                        <p style="font-size: 16px;">Hi <strong>${booking.patient.name}</strong>,</p>
                                        <p style="font-size: 16px;">Your appointment with <strong>Dr. ${doctor.name}</strong> has been confirmed. Here are the details:</p>
                                        <p style="font-size: 16px;"><strong>Date:</strong> ${booking.date.toDateString()}</p>
                                        <p style="font-size: 16px;"><strong>Time:</strong> ${booking.time}</p>
                                        <p style="font-size: 16px;"><strong>Consultation Type:</strong> Video call</p>
                                        <p style="font-size: 16px;"><strong>Meeting Link:</strong></p>
                                        <div style="text-align: center; margin: 20px 0;">
                                            <a href="${booking.meetingLink}" style="padding: 14px 24px; color: white; background-color: #FF7F50; text-decoration: none; border-radius: 5px; font-size: 16px; display: inline-block;">Join Video Call</a>
                                        </div>
                                        <p style="font-size: 16px;">Best regards,<br><strong>The MedxBay Team</strong></p>
                                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                    </div>`;
                    await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                    await sendAppointmentEmail(doctor.email, doctor.name, 'Appointment Confirmation Notification', emailContent);

                    chatMessage = `Your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed. Join the meeting using the following link: ${booking.meetingLink}`;
                } else if (booking.consultationType === 'In-person') {
                    emailSubject = 'Appointment Confirmation';
                    emailContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
                                        <h2 style="color: #FF7F50; text-align: center;">Appointment Confirmation</h2>
                                        <p style="font-size: 16px;">Hi <strong>${booking.patient.name}</strong>,</p>
                                        <p style="font-size: 16px;">Your appointment with <strong>Dr. ${doctor.name}</strong> has been confirmed. Here are the details:</p>
                                        <p style="font-size: 16px;"><strong>Date:</strong> ${booking.date.toDateString()}</p>
                                        <p style="font-size: 16px;"><strong>Time:</strong> ${booking.time}</p>
                                        <p style="font-size: 16px;"><strong>Consultation Type:</strong> In-person</p>
                                        <p style="font-size: 16px;"><strong>Location:</strong> ${booking.hospital.name}, ${booking.hospital.location.street}, ${booking.hospital.location.city}</p>
                                        <p style="font-size: 16px;">Best regards,<br><strong>The MedxBay Team</strong></p>
                                        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                    </div>`;
                    await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                    await sendAppointmentEmail(doctor.email, doctor.name, 'Appointment Confirmation Notification', emailContent);

                    chatMessage = `Your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed. The appointment will take place at ${booking.hospital.name}, ${booking.hospital.location.street}, ${booking.hospital.location.city}.`;
                }

                await Notification.create({
                    userId: booking.patient._id,
                    message: chatMessage,
                    type: 'appointment',
                    chatId: await Chat.findOne({ doctorId: booking.doctor, patientId: booking.patient }).select('_id')
                });

                await Notification.create({
                    userId: booking.doctor._id,
                    message: chatMessage,
                    type: 'appointment',
                    chatId: await Chat.findOne({ doctorId: booking.doctor, patientId: booking.patient }).select('_id')
                });

                await Chat.findOneAndUpdate(
                    { doctorId: booking.doctor, patientId: booking.patient },
                    { $push: { messages: { senderId: booking.doctor, text: chatMessage, timestamp: new Date() } } },
                    { upsert: true, new: true }
                );
            } else if (status === 'rejected') {
                emailSubject = 'Appointment Rejection';
                emailContent = `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
                                    <h2 style="color: #FF7F50; text-align: center;">Appointment Rejection</h2>
                                    <p style="font-size: 16px;">Hi <strong>${booking.patient.name}</strong>,</p>
                                    <p style="font-size: 16px;">We regret to inform you that your appointment with <strong>Dr. ${doctor.name}</strong> on <strong>${booking.date.toDateString()}</strong> at <strong>${booking.time}</strong> has been rejected.</p>
                                    <p style="font-size: 16px;">Best regards,<br><strong>The MedxBay Team</strong></p>
                                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                </div>`;
                await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                chatMessage = `We regret to inform you that your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been rejected.`;

                await Notification.create({
                    userId: booking.patient._id,
                    message: chatMessage,
                    type: 'appointment',
                    chatId: await Chat.findOne({ doctorId: booking.doctor, patientId: booking.patient }).select('_id')
                });
            }
        }

        res.status(200).json({ message: 'Booking status updated successfully' });
    } catch (error) {
        console.error('Error updating booking:', error);
        res.status(500).send('Server error');
    }
});

router.get('/completed-bookings', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctorId = req.session.user._id;
        const completedBookings = await Booking.find({ doctor: doctorId, status: 'completed' })
            .populate('patient')
            .populate('doctor') // Ensure doctor is populated
            .sort({ date: 'desc' });

        res.json({ bookings: completedBookings });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.get('/reviews/:doctorId', isLoggedIn, async (req, res) => {
    try {
        const doctorId = req.params.doctorId;
        if (!doctorId) {
            return res.status(400).json({ error: 'Doctor ID is required' });
        }

        const doctor = await Doctor.findById(doctorId)
            .populate({
                path: 'reviews.patientId',
                select: 'name'
            });

        if (!doctor) {
            return res.status(404).json({ error: 'Doctor not found' });
        }

        const reviews = doctor.reviews.map(review => ({
            ...review.toObject(),
            patientName: review.patientId ? review.patientId.name : 'Unknown'
        }));

        res.json({ reviews, doctor });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: 'Server Error' });
    }
});



router.get('/bookings/:id/prescription', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const booking = await Booking.findById(bookingId).populate('patient').populate('doctor');

        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        const patient = booking.patient;
        const doctor = booking.doctor;

        const today = new Date();
        const birthDate = new Date(patient.dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDifference = today.getMonth() - birthDate.getMonth();
        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        res.render('uploadPrescription', {
            booking,
            patient,
            doctor,
            patientAge: age
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


router.post('/prescriptions/upload', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const { patientId, doctorId, patientName, doctorName, doctorSpeciality, doctorEmail, patientAge, medicines, meetingDate, meetingTime } = req.body;

        const processedMedicines = medicines.map(medicine => ({
            name: medicine.name,
            dosage: medicine.dosage,
            beforeFood: !!medicine.beforeFood,
            afterFood: !!medicine.afterFood,
            timing: {
                morning: !!medicine.timing.morning,
                afternoon: !!medicine.timing.afternoon,
                night: !!medicine.timing.night
            }
        }));

        const prescription = new Prescription({
            patientId,
            doctorId,
            patientName,
            doctorName,
            doctorSpeciality,
            doctorEmail,
            patientAge,
            medicines: processedMedicines,
            meetingDate: new Date(meetingDate),
            meetingTime
        });

        await prescription.save();

        const downloadLink = `${req.protocol}://${req.get('host')}/patient/prescriptions/${prescription._id}/download`;

        const chatMessage = `You have a new prescription from Dr. ${doctorName}. You can download it using the following link: ${downloadLink}`;
        await Chat.findOneAndUpdate(
            { doctorId: doctorId, patientId: patientId },
            { $push: { messages: { senderId: doctorId, text: chatMessage, timestamp: new Date() } } },
            { upsert: true, new: true }
        );

        res.redirect('/doctor/completed-bookings');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});



router.get('/doctor-view/:id/prescriptions', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const patientId = req.params.id;
        const prescriptions = await Prescription.find({ patientId }).populate('doctorId').populate('patientId');

        if (!prescriptions) {
            return res.status(404).send('No prescriptions found for this patient');
        }

        res.render('view-prescriptions', {
            prescriptions
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});
router.get('/manage-time-slots', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail }).populate('timeSlots.hospital').exec();

        if (!doctor) {
            return res.status(404).send('Doctor not found');
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
            doctor: doctor._id,
            date: {
                $gte: new Date(currentYear, currentMonth, 1),
                $lte: new Date(currentYear, currentMonth, daysInMonth, 23, 59, 59)
            },
            status: 'accepted'
        });

        const data = {
            doctor,
            currentMonth,
            currentYear,
            daysInMonth,
            timeSlots: doctor.timeSlots,
            bookings,
            months: [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ]
        };

        res.json(data);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


router.delete('/manage-time-slots/:id', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        console.log('Request Params:', req.params);

        const doctorEmail = req.session.user.email;
        const { id } = req.params;

        let doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        // Find the slot to be deleted
        const slotToDelete = doctor.timeSlots.find(slot => slot._id.toString() === id);
        if (!slotToDelete) {
            return res.status(404).json({ message: 'Time slot not found' });
        }

        doctor.timeSlots = doctor.timeSlots.filter(slot => slot._id.toString() !== id);
        await doctor.save();

        res.status(200).json({ message: 'Time slot deleted', deletedSlot: slotToDelete });
    } catch (error) {
        console.error(error.message);
        res.status(500).json({ message: 'Server Error' });
    }
});



router.post('/add-time-slot', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const { date, startTime, endTime, hospital, consultationType, endDate } = req.body;

        const doctor = await Doctor.findOne({ email: doctorEmail });
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        if (doctor.subscriptionType === 'Free' && doctor.maxTimeSlots <= 0) {
            return res.json({ error: 'You have reached the limit of time slots for the free trial. Please subscribe to add more.' });
        }

        const start = new Date(date);
        const end = new Date(endDate || date);

        if (isNaN(start.getTime()) || isNaN(end.getTime()) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
            return res.status(400).send('Invalid date or time format');
        }

        let currentDate = new Date(start);
        let newTimeSlots = [];

        while (currentDate <= end) {
            if (doctor.subscriptionType === 'Free' && doctor.maxTimeSlots <= 0) {
                return res.json({ error: 'You have reached the limit of time slots for the free trial. Please subscribe to add more.' });
            }

            const newTimeSlot = {
                date: new Date(currentDate),
                startTime,
                endTime,
                status: 'free',
                consultation: consultationType
            };

            if (consultationType !== 'Video call') {
                const selectedHospital = doctor.hospitals.find(h => h.name === hospital);
                if (!selectedHospital) {
                    return res.status(404).send('Hospital not found');
                }

                newTimeSlot.hospital = hospital;
                newTimeSlot.hospitalLocation = {
                    street: selectedHospital.street,
                    city: selectedHospital.city,
                    state: selectedHospital.state,
                    country: selectedHospital.country,
                    zip: selectedHospital.zip
                };

                if (selectedHospital.lat && selectedHospital.lng) {
                    newTimeSlot.lat = selectedHospital.lat;
                    newTimeSlot.lng = selectedHospital.lng;
                }
            }

            newTimeSlots.push(newTimeSlot);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (doctor.subscriptionType === 'Free' && newTimeSlots.length > doctor.maxTimeSlots) {
            return res.json({ error: 'You are allowed to add only a limited number of time slots for the free trial. Please subscribe to add more.' });
        }

        doctor.timeSlots.push(...newTimeSlots);

        if (doctor.subscriptionType === 'Free') {
            doctor.maxTimeSlots -= newTimeSlots.length;
        }

        await doctor.save();
        res.redirect('/doctor/manage-time-slots');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});





async function createGoogleMeetLink(booking) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = {
        summary: `Appointment with Dr. ${booking.doctor.name}`,
        description: `Appointment with Dr. ${booking.doctor.name} and patient ${booking.patient.name}`,
        start: {
            dateTime: booking.date.toISOString(),
            timeZone: 'America/Los_Angeles',
        },
        end: {
            dateTime: new Date(booking.date.getTime() + 30 * 60000).toISOString(),
            timeZone: 'America/Los_Angeles',
        },
        attendees: [
            { email: booking.doctor.email },
            { email: booking.patient.email },
        ],
        conferenceData: {
            createRequest: {
                requestId: 'some-random-string',
                conferenceSolutionKey: {
                    type: 'hangoutsMeet'
                }
            }
        },
    };

    try {
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });

        return response.data.hangoutLink;
    } catch (error) {
        console.error('Error creating Google Meet link:', error);
        throw new Error('Unable to create Google Meet link');
    }
}

async function sendAppointmentEmail(to, name, subject, content) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html: content,
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Unable to send email');
    }
}

router.get('/calendar', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctorId = req.session.user._id;
        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            return res.status(404).send('Doctor not found');
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
            doctor: doctorId,
            date: {
                $gte: new Date(currentYear, currentMonth, 1),
                $lte: new Date(currentYear, currentMonth, daysInMonth, 23, 59, 59)
            },
            status: 'accepted'
        });

        const currentTime = {
            hours: currentDate.getHours(),
            minutes: currentDate.getMinutes(),
            seconds: currentDate.getSeconds()
        };

        res.render('doctorCalendar', {
            doctor,
            currentMonth,
            currentYear,
            daysInMonth,
            bookings,
            today: currentDate,
            currentTime,
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

router.use(methodOverride('_method'));

router.get('/subscribe', isLoggedIn, async (req, res) => {
    res.render('subscriptionForm');
});


router.post('/subscribe', isLoggedIn, async (req, res) => {
    try {
        const { subscriptionType, subscriptionDuration } = req.body;
        const paymentDetails = req.body.paymentDetails;
        const doctorId = req.session.user._id;
        const amount = parseInt(paymentDetails.amount, 10);
        console.log(amount);

        if (isNaN(amount) || amount <= 0) {
            return res.json(400).send('Invalid payment amount');
        }

        const doctor = await Doctor.findById(doctorId);


        if (doctor.subscriptionType !== 'Standard') {
            return res.status(403).send('You already have an active subscription. You cannot subscribe again until the current plan ends.');
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${subscriptionType} Subscription`,
                    },
                    unit_amount: amount,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/api/doctor/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/api/doctor/subscription-failure`,
        });

        req.session.subscriptionInfo = {
            doctorId,
            subscriptionType,
            subscriptionDuration,
            paymentDetails: {
                amount: amount,
                currency: 'usd'
            }
        };

        res.json(session.url);
    } catch (error) {
        console.error(error.message);
        res.json(500).send('Server Error');
    }
});


router.get('/subscription-success', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

        if (session.payment_status === 'paid') {
            const { doctorId, subscriptionType, paymentDetails, subscriptionDuration } = req.session.subscriptionInfo;
            const subscriptionDate = new Date();

            const paymentDetailsString = JSON.stringify(paymentDetails);

            const updatedDoctor = await Doctor.findByIdAndUpdate(
                doctorId,
                {
                    subscription: 'Pending',
                    subscriptionType,
                    paymentDetails: paymentDetailsString,
                    subscriptionVerification: 'Verified',
                    subscriptionDate,
                    subscriptionDuration: subscriptionDuration === 'annual' ? 'annual' : 'monthly'
                },
                { new: true }
            );

            res.render('subscriptionSuccess', { doctor: updatedDoctor });
        } else {
            res.status(400).send('Payment was not successful');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


router.get('/subscription-failure', (req, res) => {
    res.send('Subscription payment failed. Please try again.');
});

router.get('/blog', async (req, res) => {
    try {
        const conditions = await Condition.find();

        res.json({ conditions });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


router.post('/blog', upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 10 }
]), async (req, res) => {
    try {
        const authorEmail = req.session.user.email;

        const doctor = await Doctor.findOne({ email: authorEmail });

        let authorId = doctor ? doctor._id : null;
        let authorName = doctor ? doctor.name : 'Unknown';

        const { title, description, categories, hashtags, priority, selectedConditions } = req.body;

        const coverImage = req.files['image'] ? req.files['image'][0] : null;
        const coverImageData = coverImage ? {
            data: coverImage.buffer,
            contentType: coverImage.mimetype
        } : null;

        const images = req.files['images'] ? req.files['images'].map(file => ({
            data: file.buffer,
            contentType: file.mimetype
        })) : [];

        const newBlog = new Blog({
            title,
            author: authorName,
            description,
            authorEmail,
            authorId,
            categories,
            hashtags,
            priority,
            conditions: selectedConditions,
            image: coverImageData,
            images: images,
            verificationStatus: 'Pending'
        });

        await newBlog.save();

        res.render('blog-success', { message: 'Blog uploaded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});



router.get('/blogs', isDoctor, isLoggedIn, async (req, res) => {
    try {
        let filter = { verificationStatus: 'Verified' };

        if (req.query.search) {
            const regex = new RegExp(escapeRegex(req.query.search), 'gi');

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
        const hashtags = await Blog.distinct('hashtags', { verificationStatus: 'Verified' });

        // Count the number of blogs in each category
        const categoryCountMap = await Blog.aggregate([
            { $match: { verificationStatus: 'Verified' } },
            { $unwind: '$categories' },
            { $group: { _id: '$categories', count: { $sum: 1 } } },
            { $project: { _id: 1, count: 1 } }
        ]).exec();

        const categoryCountMapObj = categoryCountMap.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        // Count the number of blogs in each hashtag
        const hashtagCountMap = await Blog.aggregate([
            { $match: { verificationStatus: 'Verified' } },
            { $unwind: '$hashtags' },
            { $group: { _id: '$hashtags', count: { $sum: 1 } } },
            { $project: { _id: 1, count: 1 } }
        ]).exec();

        const hashtagCountMapObj = hashtagCountMap.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        // Find blogs based on the filter
        const verifiedBlogs = await Blog.find(filter).lean();

        // Fetch most read blogs
        const mostReadBlogs = await Blog.find({ verificationStatus: 'Verified' })
            .sort({ readCount: -1 })
            .limit(5)
            .lean();

        // Fetch related posts based on categories (exclude current category)
        const relatedPosts = await Blog.find({
            verificationStatus: 'Verified',
            categories: { $in: categories }
        })
            .limit(5)
            .lean();

        res.json({
            blogs: verifiedBlogs,
            searchQuery: req.query.search,
            categories,
            hashtags,
            categoryCountMap: categoryCountMapObj, // Pass category counts to template
            hashtagCountMap: hashtagCountMapObj, // Pass hashtag counts to template
            filterType: 'All', // Default filter type
            filterValue: '', // Default filter value
            mostReadBlogs, // Add most read blogs
            relatedPosts // Add related posts
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});





router.get('/profile/blogs', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;

        const blogs = await Blog.find({ authorEmail: doctorEmail });

        res.json({ blogs });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/blogs/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        const conditions = await Condition.find();

        if (!blog) {
            console.error('Blog not found');
            return res.status(404).json({ message: 'Blog not found' });
        }

        if (blog.authorId.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized' });
        }

        const hashtags = Array.isArray(blog.hashtags) ? blog.hashtags : blog.hashtags.split(',');
        const categories = Array.isArray(blog.categories) ? blog.categories : blog.categories.split(',');

        return res.json({ blog, conditions, hashtags, categories });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ message: 'Server Error' });
    }
});



router.post('/blogs/edit/:id', isLoggedIn, checkSubscription, upload.single('image'), async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).send('Blog not found');
        }

        if (blog.authorId.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Unauthorized');
        }

        const { title, description, category, hashtags, selectedConditions } = req.body;

        blog.title = title;
        blog.description = description;
        blog.categories = Array.isArray(category) ? category : category;
        blog.hashtags = Array.isArray(hashtags) ? hashtags : hashtags.split(',');
        blog.conditions = selectedConditions;

        blog.verificationStatus = 'Pending';

        if (req.file) {
            blog.image.data = req.file.buffer;
            blog.image.contentType = req.file.mimetype;
        }

        await blog.save();

        res.redirect('/doctor/profile/blogs');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});



router.post('/profile/blogs/delete/:id', isLoggedIn, async (req, res) => {
    try {
        await Blog.findByIdAndDelete(req.params.id);
        req.flash('success_msg', 'Blog successfully deleted');
        res.redirect('/doctor/profile/blogs');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/dashboard', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctor = await Doctor.findOne({ email: req.session.user.email }).lean();
        if (!doctor) {
            return res.status(404).json({ error: 'Doctor not found' }); // Return JSON error response
        }

        const chats = await Chat.find({ doctorId: doctor._id })
            .populate('patientId', 'name profilePicture') // Assuming patient has a profilePicture field
            .sort({ updatedAt: -1 })
            .lean();

        // Calculate unread message count for each chat
        chats.forEach(chat => {
            chat.unreadCount = chat.messages.filter(message =>
                !message.read && message.senderId.toString() !== doctor._id.toString()
            ).length;
        });

        // Send JSON response with doctor and chats data
        res.json({ doctor, chats });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Server Error' }); // Return JSON error response
    }
});

router.post('/chats/:chatId/send-message', isLoggedIn, async (req, res) => {
    try {
        const { message } = req.body;
        const doctor = await Doctor.findOne({ email: req.session.user.email });
        const chatId = req.params.chatId;

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        let chat = await Chat.findOneAndUpdate(
            { _id: chatId, doctorId: doctor._id },
            { $push: { messages: { senderId: doctor._id, text: message, timestamp: new Date(), read: false } } },
            { new: true }
        );

        if (!chat) {
            return res.status(404).send('Chat not found');
        }

        console.log("Chat ID:", chat._id);

        const patient = await Patient.findById(chat.patientId);

        if (patient) {
            await Notification.create({
                userId: patient._id,
                message: `New message from Dr. ${doctor.name}: ${message}`,
                type: 'chat',
                chatId: chat._id,
                read: false,
                createdAt: new Date()
            });

            console.log("Notification created with chat ID:", chat._id);
        }

        res.json(`/doctor/chat/${chat._id}`);

    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).send('Server Error');
    }
});

router.get('/chat/:id', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const chatId = req.params.id;

        // console.log('Request Details:', {
        //     method: req.method,
        //     url: req.url,
        //     params: req.params,
        //     query: req.query,
        //     user: req.user
        // });

        const chat = await Chat.findById(chatId)
            .populate('patientId', 'name email profilePicture')
            .lean();


        // console.log('Fetched Chat Object:', chat);

        if (!chat) {
            console.log('Chat not found');
            return res.status(404).json({ error: 'Chat not found' }); // Return JSON error response
        }

        chat.messages.forEach(message => {
            if (!message.text) {
                console.error(`Message missing text found: ${message._id}`);
            }

            if (message.senderId.toString() !== req.user._id.toString() && !message.read) {
                message.read = true;
            }
        });

        // Update the chat in the database with the read messages
        await Chat.findByIdAndUpdate(chatId, { $set: { messages: chat.messages } });

        // console.log('Updated Chat Data:', chat);

        // Send JSON response with chat data
        res.json({
            chat,
            patientProfilePicture: chat.patientId.profilePicture
        });


    } catch (err) {
        console.error('Error Message:', err.message);
        res.status(500).json({ error: 'Server Error' }); // Return JSON error response
    }
});


router.get('/blogs/view/:id', async (req, res) => {
    try {
        const blogId = req.params.id;

        let blog = await Blog.findById(blogId).lean();
        if (!blog) {
            return res.status(404).send('Blog not found');
        }

        if (!req.session.viewedBlogs) {
            req.session.viewedBlogs = [];
        }

        if (!req.session.viewedBlogs.includes(blogId)) {
            await Blog.findByIdAndUpdate(blogId, { $inc: { readCount: 1 } });
            req.session.viewedBlogs.push(blogId);
        }

        const relatedPosts = await Blog.find({
            $or: [
                { categories: { $in: blog.categories } },
                { hashtags: { $in: blog.hashtags } }
            ],
            _id: { $ne: blog._id },
            verificationStatus: "Verified"
        }).limit(5).lean();

        const mostReadPosts = await Blog.find({
            _id: { $ne: blog._id },
            verificationStatus: "Verified"
        }).sort({ readCount: -1 }).limit(5).lean();

        let blogImageBase64 = null;
        if (blog.image && blog.image.data) {
            blogImageBase64 = Buffer.from(blog.image.data).toString('base64');
        }

        const blogUrl = `http://medxbay.com/doctor/blogs/view/${blogId}`;
        const encodedBlogUrl = encodeURIComponent(blogUrl);
        const encodedTitle = encodeURIComponent(blog.title);

        const facebookShareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedBlogUrl}`;
        const twitterShareUrl = `https://twitter.com/intent/tweet?url=${encodedBlogUrl}&text=${encodedTitle}`;

        res.render('DoctorViewBlog', {
            blog,
            relatedPosts,
            mostReadPosts,
            facebookShareUrl,
            blogImageBase64,
            twitterShareUrl
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/blogs/comment/:id', isLoggedIn, async (req, res) => {
    try {
        const { comment } = req.body;
        const blogId = req.params.id;
        const blog = await Blog.findById(blogId);
        const authorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: authorEmail });

        if (!blog) {
            return res.status(404).send('Blog not found');
        }


        blog.comments.push({
            username: doctor.name,
            comment: comment,
            profilePicture: {
                data: doctor.profilePicture.data,
                contentType: doctor.profilePicture.contentType
            }
        });

        await blog.save();

        res.json({ message: 'Blog uploaded successfully' });
        // res.redirect(/doctor/blogs/view/${blogId});
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

        res.render('doctor-author-info', {
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
        let filter = { verificationStatus: 'Verified' };

        if (req.query.search) {
            const regex = new RegExp(escapeRegex(req.query.search), 'gi');

            filter = {
                verificationStatus: 'Verified',
                $or: [
                    { title: regex },
                    { categories: regex },
                    { hashtags: regex }
                ]
            };
        }

        const verifiedBlogs = await Blog.find(filter).lean();

        res.render('Doctorblogs', { blogs: verifiedBlogs, searchQuery: req.query.search });

    } catch (err) {
        console.error(err.message);
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

router.get('/insights', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).json({ message: 'Doctor not found' });
        }

        const totalPatients = await Booking.aggregate([
            { $match: { doctor: doctor._id, status: 'completed' } },
            { $group: { _id: "$patient" } },
            { $count: "uniquePatients" }
        ]);

        const totalConsultations = await Booking.countDocuments({ doctor: doctor._id, status: 'completed' });
        const totalReviews = doctor.reviews.length;
        const bookings = await Booking.find({ doctor: doctor._id }).populate('patient');

        const totalRatings = doctor.reviews.reduce((acc, review) => acc + review.rating, 0);
        const averageRating = totalReviews > 0 ? (totalRatings / totalReviews).toFixed(1) : 'No ratings';

        const bookingFilter = req.query['booking-filter'] || 'all';
        const insightsFilter = req.query['insight-filter'] || 'all';

        let startDate, endDate;

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

        const bookingRates = await Booking.aggregate([
            { $match: { doctor: doctor._id, date: { $gte: startDate, $lte: endDate } } },
            {
                $group: {
                    _id: { $dayOfWeek: '$date' },
                    count: { $sum: 1 }
                }
            }
        ]);

        const totalUnreadMessages = await Chat.aggregate([
            { $match: { doctorId: doctor._id } },
            { $unwind: '$messages' },
            { $match: { 'messages.read': false, 'messages.senderId': { $ne: doctor._id } } },
            { $count: 'unreadCount' }
        ]);

        const waitingAppointmentsCount = await Booking.countDocuments({
            doctor: doctor._id,
            status: 'waiting'
        });

        const totalPostedSlots = doctor.timeSlots.length;
        const totalFilledSlots = doctor.timeSlots.filter(slot => slot.status === 'booked').length;

        res.json({
            doctor,
            totalPatients: totalPatients[0]?.uniquePatients || 0,
            totalConsultations,
            totalReviews,
            averageRating,
            bookingRates,
            totalUnreadMessages: totalUnreadMessages[0]?.unreadCount || 0,
            waitingAppointmentsCount,
            totalPostedSlots,
            totalFilledSlots,
            bookingFilter,
            insightsFilter,
            bookings
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ message: 'Server Error' });
    }
});

router.get('/accept-invite/:corporateId/:doctorId?/:requestId?', async (req, res) => {
    if (!req.session.user) {
        req.flash('error_msg', 'You must be logged in to accept the invite');
        return res.redirect(`${process.env.REACT_APP_BASE_URL}/login`);
    }

    const { corporateId, requestId } = req.params;
    const doctorId = req.session.user._id;

    try {
        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            req.flash('error_msg', 'Doctor not found');
            return res.redirect(`${process.env.REACT_APP_BASE_URL}/login`);
        }

        let request;
        if (requestId) {
            request = doctor.corporateRequests.id(requestId);
            if (!request || request.corporateId.toString() !== corporateId.toString()) {
                req.flash('error_msg', 'Request not found or invalid');
                return res.redirect(`${process.env.REACT_APP_BASE_URL}/login`);
            }
        } else {
            request = {
                corporateId,
                corporateName: 'Corporate Name',
                requestStatus: 'accepted',
            };
            doctor.corporateRequests.push(request);
        }

        if (!requestId) {
            request.requestStatus = 'accepted';
        }
        await doctor.save();

        const corporate = await Corporate.findById(corporateId);
        if (!corporate) {
            req.flash('error_msg', 'Corporate not found');
            return res.redirect(`${process.env.REACT_APP_BASE_URL}/login`);
        }

        if (!corporate.doctors.includes(doctor._id)) {
            corporate.doctors.push(doctor._id);
            await corporate.save();
        }

        req.flash('success_msg', 'Invitation accepted and doctor added to corporate');
        res.redirect(`${process.env.REACT_APP_BASE_URL}/edit/profile/doctor`);
    } catch (err) {
        console.error('Error accepting invite:', err);
        req.flash('error_msg', 'Error accepting invitation');
        res.redirect(`${process.env.REACT_APP_BASE_URL}/login`);
    }
});


router.get('/view-corporate-request/:doctorId', async (req, res) => {
    const doctorId = req.params.doctorId;
  
    try {
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        req.flash('error_msg', 'Doctor not found');
        return res.redirect('/doctors');
      }
  
      const corporateRequests = doctor.corporateRequests;
  
      if (corporateRequests.length === 0) {
        req.flash('error_msg', 'No corporate requests found');
        return res.redirect('/doctors');
      }
  
      const corporates = await Corporate.find({
        _id: { $in: corporateRequests.map(request => request.corporateId) }
      });
  
      const requestsWithCorporate = corporateRequests.map(request => {
        const corporate = corporates.find(corp => corp._id.toString() === request.corporateId.toString());
        return { ...request.toObject(), corporate }; 
      });
  
      res.render('corporate-requests', {
        doctor,
        corporateRequests: requestsWithCorporate, 
        pageTitle: 'View Corporate Requests'
      });
    } catch (err) {
      console.error('Error viewing corporate request:', err);
      req.flash('error_msg', 'Error fetching corporate requests');
      res.redirect('/doctors');
    }
  });
  
  router.post('/update-corporate-request-status/:doctorId/:corporateId/:requestId', async (req, res) => {
    const doctorId = req.params.doctorId;
    const corporateId = req.params.corporateId;
    const requestId = req.params.requestId;  
    const { newStatus } = req.body; 
  
    try {
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        req.flash('error_msg', 'Doctor not found');
        return res.redirect(`/doctor/view-corporate-request/${doctorId}`);
      }
  
      const request = doctor.corporateRequests.id(requestId);
      if (!request || request.corporateId.toString() !== corporateId.toString()) {
        req.flash('error_msg', 'Request not found');
        return res.redirect(`/doctor/view-corporate-request/${doctorId}`);
      }
  
      request.requestStatus = newStatus;
  
      if (newStatus === 'accepted') {
        const corporate = await Corporate.findById(corporateId);
        if (!corporate) {
          req.flash('error_msg', 'Corporate not found');
          return res.redirect(`/doctor/view-corporate-request/${doctorId}`);
        }
  
        if (!corporate.doctors) {
          corporate.doctors = [];  
        }
        
        if (!corporate.doctors.includes(doctor._id)) {
          corporate.doctors.push(doctor._id);
        }
  
        await corporate.save();
        req.flash('success_msg', 'Doctor added to corporate successfully');
      }
  
      await doctor.save();
  
      req.flash('success_msg', 'Request status updated successfully');
      res.redirect(`/doctor/view-corporate-request/${doctorId}`);
    } catch (err) {
      console.error('Error updating corporate request status:', err);
      req.flash('error_msg', 'Error updating request status');
      res.redirect('/doctors');
    }
  });

  router.get('/corporate-list', async (req, res) => {
    try {
      const corporates = await Corporate.find().select('corporateName tagline address profilePicture');
  
      res.render('doctor-corporate-list', { corporates });
  
    } catch (err) {
      console.error('Error fetching corporate list:', err);
      req.flash('error_msg', 'Error retrieving corporate list');
      res.redirect('/doctor/doctor-index');
    }
  });
  

  router.get('/corporate/:corporateId', async (req, res) => {
    const { corporateId } = req.params;
    const doctorId = req.session.user._id;
  
    try {
      const corporate = await Corporate.findById(corporateId)
        .populate('doctors') 
        .populate({
          path: 'doctorReviews',
          populate: {
            path: 'doctorId',
            select: 'name profilePicture'
          }
        })
        .populate({
          path: 'patientReviews',
          populate: {
            path: 'patientId',
            select: 'name profilePicture'
          }
        });
  
      if (!corporate) {
        req.flash('error_msg', 'Corporate not found');
        return res.redirect('/doctor/corporate-list');
      }
  
      corporate.doctorReviews = corporate.doctorReviews.filter(review => review.showOnPage);
      corporate.patientReviews = corporate.patientReviews.filter(review => review.showOnPage);
  
      const isFollowing = corporate.followers.some(
        followerId => followerId.toString() === doctorId.toString()
      );
  
      const doctors = corporate.doctors || [];
      const followerCount = corporate.followers.length;
  
      res.render('doctor-corporate-details', {
        corporate,
        doctors,
        followerCount,
        isFollowing,
        doctorReviews: corporate.doctorReviews,
        patientReviews: corporate.patientReviews
      });
    } catch (err) {
      console.error('Error fetching corporate details:', err);
      req.flash('error_msg', 'Error fetching corporate details');
      res.redirect('/doctor/corporate-list');
    }
  });  
  
router.post('/corporate/:corporateId/follow', async (req, res) => {
    const { corporateId } = req.params;
    const doctorId = req.session.user._id;

    try {
        const corporates = await Corporate.findById(corporateId);
        const doctor = await Doctor.findById(doctorId);

        if (!corporates || !doctor) {
            req.flash('error_msg', 'Corporate or Doctor not found');
            return res.redirect(`/doctor/corporate/${corporateId}`);
        }

        const alreadyFollowing = corporates.followers.some(
            follower => follower.toString() === doctorId.toString()
        );

        if (alreadyFollowing) {
            corporates.followers = corporates.followers.filter(
                follower => follower.toString() !== doctorId.toString()
            );
            req.flash('success_msg', 'You have unfollowed the corporate');
        } else {
            corporates.followers.push(doctorId);
            req.flash('success_msg', 'You have followed the corporate');
        }

        await corporates.save();
        res.redirect(`/doctor/corporate/${corporateId}`);
    } catch (err) {
        console.error('Error updating follow status:', err);
        req.flash('error_msg', 'Error updating follow status');
        res.redirect(`/doctor/corporate/${corporateId}`);
    }
});

router.post('/corporate/:corporateId/add-review', async (req, res) => {
    const { corporateId } = req.params;
    const { rating, reviewText } = req.body;
    const doctorId = req.session.user._id;
  
    try {
      const corporate = await Corporate.findById(corporateId);
  
      if (!corporate) {
        return res.status(404).send('Corporate not found');
      }
  
      const review = {
        doctorId,
        rating,
        reviewText,
        createdAt: new Date(),
      };
  
      corporate.doctorReviews.push(review);
      await corporate.save();
  
      res.redirect(`/doctor/corporate/${corporateId}`);
    } catch (error) {
      console.error(error);
      res.status(500).send('Internal server error');
    }
  });

  router.post('/claim-profile', upload.single('document'), async (req, res) => {
    const { doctorId, email } = req.body;
    const document = req.file; 

    if (!doctorId || !email || !document) {
        return res.status(400).send('Missing required fields');
    }

    try {
        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        doctor.profileTransferRequest = 'Pending';

        const profileVerification = {
            email,
            document: {
                data: document.buffer,
                contentType: document.mimetype,
            },
        };

        doctor.profileVerification.push(profileVerification);

        await doctor.save();

        res.status(200).send('Profile claim request submitted successfully');
    } catch (error) {
        console.error('Error claiming profile:', error);
        res.status(500).send('An error occurred while claiming the profile');
    }
});

module.exports = router;