// @ts-nocheck
import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
dotenv.config()
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseServiceKey)
async function createBucket() {
    console.log("Checking for 'resumes' bucket in Supabase...")
    const { data: buckets, error: listError } = await supabase.storage.listBuckets()
    if (listError) {
        console.error("Error listing buckets:", listError)
        return
    }
    const bucketExists = buckets.some(b => b.name === 'resumes')
    if (bucketExists) {
        console.log("Bucket 'resumes' already exists. Updating to public...")
        const { error } = await supabase.storage.updateBucket('resumes', {
            public: true,
            allowedMimeTypes: ['application/pdf'],
            fileSizeLimit: 5242880 // 5MB
        })
        if (error) console.error("Error updating bucket:", error)
        else console.log("Bucket 'resumes' updated to public successfully!")
    } else {
        console.log("Creating 'resumes' bucket...")
        const { data, error } = await supabase.storage.createBucket('resumes', {
            public: true,
            allowedMimeTypes: ['application/pdf'],
            fileSizeLimit: 5242880 // 5MB
        })
        if (error) {
            console.error("Error creating bucket:", error)
        } else {
            console.log("Bucket 'resumes' created successfully!")
        }
    }
}
createBucket()
