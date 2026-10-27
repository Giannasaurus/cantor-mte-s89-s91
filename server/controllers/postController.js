const Post = require("../models/Post")
const User = require("../models/User")
const mongoose = require("mongoose")
const { errorHandler } = require("../auth")

const isValidPostId = (postId) => /^[a-fA-F0-9]{24}$/.test(postId)

const includeAuthorUsernames = async (posts) => {
    const postList = Array.isArray(posts) ? posts : [posts]
    const authorIds = [...new Set(postList
        .map(post => String(post.author))
        .filter(authorId => mongoose.Types.ObjectId.isValid(authorId)))]
    const users = await User.find({ _id: { $in: authorIds } })
        .select("_id username")
        .lean()
    const usernames = new Map(users.map(user => [String(user._id), user.username]))

    return postList.map(post => ({
        ...post.toObject(),
        authorUsername: usernames.get(String(post.author)) || "Unknown writer"
    }))
}

const validatePostId = (postId, res) => {
    if (!isValidPostId(postId)) {
        res.status(400).send({ error: "Invalid post ID" })
        return false
    }

    return true
}

const validatePostFields = (fields, res) => {
    for (const [field, value] of Object.entries(fields)) {
        if (typeof value !== "string" || value.trim().length === 0) {
            res.status(400).send({ error: `${field} must be a non-empty string` })
            return false
        }
    }

    return true
}

module.exports.createPost = async (req, res) => {
    const { title, content } = req.body || {}

    if (!validatePostFields({ title, content }, res)) {
        return
    }

    try {
        const post = await Post.create({
            title: title.trim(),
            content: content.trim(),
            author: req.user.id
        })

        return res.status(201).send({ post })
    } catch (err) {
        return errorHandler(err, req, res)
    }
}

module.exports.getPosts = async (req, res) => {
    try {
        const posts = await Post.find()
        return res.status(200).send({ posts: await includeAuthorUsernames(posts) })
    } catch (err) {
        return errorHandler(err, req, res)
    }
}

module.exports.getMyPosts = async (req, res) => {
    try {
        const posts = await Post.find({ author: req.user.id })
        return res.status(200).send({ posts: await includeAuthorUsernames(posts) })
    } catch (err) {
        return errorHandler(err, req, res)
    }
}

module.exports.getPost = async (req, res) => {
    const { postId } = req.params

    if (!validatePostId(postId, res)) {
        return
    }

    try {
        const post = await Post.findById(postId)

        if (!post) {
            return res.status(404).send({ error: "Post not found" })
        }

        return res.status(200).send({ post: (await includeAuthorUsernames([post]))[0] })
    } catch (err) {
        return errorHandler(err, req, res)
    }
}

module.exports.updatePost = async (req, res) => {
    const { postId } = req.params

    if (!validatePostId(postId, res)) {
        return
    }

    const updates = {}
    for (const field of ["title", "content"]) {
        if (Object.prototype.hasOwnProperty.call(req.body || {}, field)) {
            updates[field] = req.body[field]
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).send({ error: "Provide a title or content to update" })
    }

    if (!validatePostFields(updates, res)) {
        return
    }

    for (const field of Object.keys(updates)) {
        updates[field] = updates[field].trim()
    }

    try {
        const post = await Post.findOneAndUpdate(
            { _id: postId, author: req.user.id },
            { $set: updates },
            { new: true, runValidators: true }
        )

        if (!post) {
            return res.status(404).send({ error: "Post not found or you do not own this post" })
        }

        return res.status(200).send({ post })
    } catch (err) {
        return errorHandler(err, req, res)
    }
}

module.exports.deletePost = async (req, res) => {
    const { postId } = req.params

    if (!validatePostId(postId, res)) {
        return
    }

    try {
        const filter = req.user.isAdmin
            ? { _id: postId }
            : { _id: postId, author: req.user.id }
        const post = await Post.findOneAndDelete(filter)

        if (!post) {
            return res.status(404).send({ error: "Post not found or you do not own this post" })
        }

        return res.status(200).send({ message: "Post deleted successfully" })
    } catch (err) {
        return errorHandler(err, req, res)
    }
}