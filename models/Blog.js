const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const blogSchema = new Schema({
    title: { type: String, required: true },
    author: { type: String, required: true },
    description: { type: String, required: true },
    // summary: { type: String, required:   true },
    authorEmail: { type: String, required: true },
    authorTitle: { type: String, required: true },
    aboutMe: { type: String, required: true },
    date: { type: Date, default: Date.now },
    image: {
        data: Buffer,
        contentType: String
    },
    profilePicture: {
        data: Buffer,
        contentType: String 
    },
    categories: {
        type: [String]
    },
    subcategories: {
        type: [String]
    },
    hashtags: {
        type: [String]
    }, 
    priority: {
        type: String,
        required: true
    },
    verificationStatus: { type: String, default: 'pending' },
    comments: [
        {
            username: String,
            comment: String,
            date: { type: Date, default: Date.now },
            profilePicture: {
                data: Buffer,
                contentType: String
            },
        }
    ],
    authorId: { type: String }
});

const Blog = mongoose.model('Blog', blogSchema);

module.exports = Blog;
