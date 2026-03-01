require('dotenv').config();
const { User, Exam, Question, OrGroup, Submission, StudentAnswer, sequelize } = require('./models');

async function testPhase2() {
  try {

    await sequelize.authenticate();



    const counts = {
      Users: await User.count(),
      Exams: await Exam.count(),
      Questions: await Question.count(),
      OrGroups: await OrGroup.count(),
      Submissions: await Submission.count(),
      StudentAnswers: await StudentAnswer.count()
    };

    console.log('📊 Tables created (all should show 0 rows):');
    Object.entries(counts).forEach(([table, count]) => {

    });


    const userWithExams = await User.findOne({
      include: [{ model: Exam, as: 'exams' }]
    });


    const examWithAll = await Exam.findOne({
      include: [
        { model: Question, as: 'questions' },
        { model: OrGroup, as: 'or_groups' },
        { model: Submission, as: 'submissions' }
      ]
    });
   

    await sequelize.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testPhase2();