
import { PrismaClient } from '@prisma/client'

async function debug() {
    console.log('--- DB Debug Start ---')
    console.log('DATABASE_URL starts with:', process.env.DATABASE_URL?.substring(0, 20))
    
    const directUrl = "postgresql://postgres.nwjusvsycphwihxamqgd:Lumoscale2026@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require"
    
    const prisma = new PrismaClient({
        log: ['query', 'info', 'warn', 'error'],
        datasources: {
            db: {
                url: directUrl
            }
        }
    })

    try {
        console.log('Attempting to connect...')
        await prisma.$connect()
        console.log('Connected successfully.')

        console.log('Fetching first Organization...')
        const org = await prisma.organization.findFirst()
        console.log('Org result:', org)

        console.log('Fetching first Drive...')
        const drive = await prisma.drive.findFirst()
        console.log('Drive result:', drive)

    } catch (err: any) {
        console.error('Connection failed!')
        console.error('Error name:', err.name)
        console.error('Error message:', err.message)
        console.error('Error code:', err.code)
    } finally {
        await prisma.$disconnect()
        console.log('--- DB Debug End ---')
    }
}

debug()
