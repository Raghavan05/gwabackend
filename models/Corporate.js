const mongoose = require('mongoose');
const slugify = require('slugify');  
const corporateSchema = new mongoose.Schema({
  corporateName: {
    type: String,
  },
  email: {
    type: String,
  },
  slug: { type: String, unique: true },
  role: {
    type: String,
  },
  mobileNumber: {
    type: String,
  },
  alternateContactNumber: { type: String },
  businessRegistrationNumber: { type: String },
  taxIdentificationNumber: { type: String },
  businessType: { type: String },
  address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zipCode: { type: String },
    country: { type: String }
  },
  companyName: { type: String },
  profilePicture: {
    data: Buffer,
    contentType: String
  },
  coverPhoto: {
    data: Buffer,
    contentType: String
  },
  tagline: { type: String },
  overview: { type: String },
  password: {
    type: String,
  },
  doctorReviews: [
    {
      doctorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Doctor',
      },
      reviewText: {
        type: String,
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      showOnPage: { type: Boolean, default: true }
    }
  ],
  patientReviews: [
    {
      patientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Patient',
      },
      reviewText: {
        type: String,
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
      showOnPage: { type: Boolean, default: true }
    }
  ],
  rating: { type: Number, default: 0 },
  totalReviews: { type: Number, default: 0 },
  verificationStatus: {
    type: String,
    default: 'Pending',
  },
  verificationToken: {
    type: String,
  },
  verificationTokenExpires: { type: Date },
  isVerified: { type: Boolean, default: false },
  followers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }],
  following: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Supplier',
  }],
  doctors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Doctor' }],
  corporateSpecialties: [{
    type: String, 
  }],
  showSpecialties: { type: Boolean},  
  showDoctors: { type: Boolean},      
  showConditionLibrary: { type: Boolean },  
  showReviews: { type: Boolean }, 

  createdByAdmin: { type: Boolean, default: false },
  profileVerification: [{
    email: { type: String },
    document: {
      data: Buffer,
      contentType: String
    },
    createdAt: { type: Date, default: Date.now } 
  }],

  profileTransferRequest: {
    type: String,
    enum: ['Accepted', 'Pending', 'Rejected', 'Idle'], 
    default: 'Idle'
  }
});


function generateRandomSlugSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789'; 
  let result = '';
  
  result += numbers.charAt(Math.floor(Math.random() * numbers.length));

  const allChars = chars + numbers;
  for (let i = 0; i < 3; i++) {
    result += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  return result;
}

corporateSchema.pre('save', async function(next) {
  if (this.corporateName) {
    let baseSlug = slugify(this.corporateName, { lower: true, strict: true });

    const existingCorporate = await this.constructor.findOne({ slug: baseSlug });

    if (existingCorporate) {
      let newSlug = `${baseSlug}-${generateRandomSlugSuffix()}`;
      
      while (await this.constructor.findOne({ slug: newSlug })) {
        newSlug = `${baseSlug}-${generateRandomSlugSuffix()}`;
      }
      
      this.slug = newSlug; 
    } else {
      this.slug = baseSlug;  
    }
  }
  next();  
});

module.exports = mongoose.model('Corporate', corporateSchema);