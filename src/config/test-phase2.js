require('dotenv').config();
const { User, Exam, Question, OrGroup, Submission, StudentAnswer, sequelize } = require('./models');

async function testPhase2() {
  try {
    console.log('🧪 Testing Phase 2 - Database Tables\n');

    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // Check each table exists by counting rows
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
      console.log(`   ✅ ${table}: ${count} rows`);
    });

    // Test associations work
    console.log('\n🔗 Testing associations...');
    const userWithExams = await User.findOne({
      include: [{ model: Exam, as: 'exams' }]
    });
    console.log('   ✅ User → Exams association works');

    const examWithAll = await Exam.findOne({
      include: [
        { model: Question, as: 'questions' },
        { model: OrGroup, as: 'or_groups' },
        { model: Submission, as: 'submissions' }
      ]
    });
    console.log('   ✅ Exam → Questions association works');
    console.log('   ✅ Exam → OrGroups association works');
    console.log('   ✅ Exam → Submissions association works');

    console.log('\n🎉 Phase 2 Complete!');
    console.log('   All 6 tables created in database');
    console.log('   All associations working');
    console.log('   Ready for Phase 3 (Authentication)!\n');

    await sequelize.close();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

testPhase2();