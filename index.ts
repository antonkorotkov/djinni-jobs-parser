import axios from 'axios'
import * as cheerio from 'cheerio'
import * as setCookie from 'set-cookie-parser'
import * as mongoose from 'mongoose'

mongoose.connect('mongodb://localhost/jobs', {useNewUrlParser: true, useUnifiedTopology: true})

mongoose.connection.on('error', (err) => console.log(err))
mongoose.connection.once('open', async () => {
  console.log('DB Connection established')
  await run()
})

import { Job, jobSchema } from './Job'

const baseUrl = 'https://djinni.co'

enum EAccountType {
  candidate = 'candidate',
  recruiter = 'recruiter'
}

const getAuthCookie = async (email: string, password: string, account_type: EAccountType): Promise<string> => {
  const loginScreen = await axios.get(`${baseUrl}/login`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS)'
    }
  })

  const $ = cheerio.load(loginScreen.data);
  const cookie = setCookie.parse(loginScreen as any);

  try {
    await axios.post(
      `${baseUrl}/login`, 
      `email=${email}&password=${password}&account_type=${account_type}&csrfmiddlewaretoken=${$('form input[name=csrfmiddlewaretoken]').val()}`, 
      {
        maxRedirects: 0,
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS)',
          'Origin': 'https://djinni.co',
          'Referer': 'https://djinni.co/login',
          'Cookie': cookie.map(coo => `${coo.name}=${coo.value}`).join('; ')
        }
      }
    )
  } catch (err) {
    const { status } = err.response
    if ( status !== 302 ) {
      throw new Error(err.message)
    }

    const sessionIdCookie = setCookie.parse(err.response as any).find(item => item.name === 'sessionid')

    if (sessionIdCookie) {
      return `${sessionIdCookie.name}=${sessionIdCookie.value}`
    }

    throw new Error('Could not get session id cookie')
  }

  return ''
}

const openPage = async (uri: string, authCookie: string, parser: Function): Promise<any> => {
  try {
    const response = await axios.get(`${baseUrl}${uri}`, {
      headers: {
        'Cookie': authCookie
      }
    });

    const $ = cheerio.load(response.data);

    return parser($)
  } catch (err) {
    console.log(err.message);
  }
}

const run = async () => {
  const authCookie = await getAuthCookie(process.env.email, process.env.password, EAccountType.candidate)

  const parser = ($: CheerioStatic): string => {
    const jobs = $('.list-jobs li')
    const nextUri = $('.pager li:nth-child(2) a').attr('href')

    jobs.map(async (_i, job) => {

      const jobObject = new Job(job)

      const uri = $('.profile', job).attr('href')
      if (uri) {
        await openPage(uri, authCookie, ($: CheerioStatic) => {
          const details = $('.profile-page-section:nth-child(2)').html().trim().replace(/\n\r/g, ' ')
          const companyUrl = $('.profile-page-section:nth-child(3) p a').attr('href')
          const company = $('.profile-page-section:nth-child(3)')
          $('h4, p', company).remove()
          jobObject.details = details
          jobObject.companyUrl = companyUrl
          jobObject.companyDetails = company.text().trim().replace(/\n\r/g, ' ')
        })
      }

      const JobModel = mongoose.model('Job', jobSchema)
      const theJob = new JobModel(jobObject)
      console.log(await JobModel.update({_id: theJob._id}, theJob, {upsert: true, setDefaultsOnInsert: true}))
    })

    return nextUri;
  }

  await openPage('/jobs', authCookie, async ($: CheerioStatic) => {
    let uri = parser($)

    while(uri) {
      console.log(uri)
      await openPage(uri, authCookie, ($: CheerioStatic) => {
        uri = parser($)
      })
    }
  })
}